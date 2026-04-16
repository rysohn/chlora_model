suppressPackageStartupMessages({
  library(dplyr)
  library(rerddap)
  library(mgcv)
  library(lubridate)
  library(ggplot2)
  library(viridis)
})

cat("Starting Ocean Forecast Pipeline...\n")

SST_TRAIN_MEAN <- 26.38728
SST_TRAIN_SD   <- 2.57392
SLA_TRAIN_MEAN <- 0.05015792
SLA_TRAIN_SD   <- 0.08898371
CURRENT_ONI    <- -0.4

end_date <- as.character(Sys.Date() - 2)
start_date <- as.character(Sys.Date() - 7)
time_window <- c(start_date, end_date)
cat("Pulling satellite data from:", start_date, "to", end_date, "\n")

upwell_url <- "https://upwell.pfeg.noaa.gov/erddap/"
coastwatch_url <- "https://coastwatch.noaa.gov/erddap/"

fetch_with_retry <- function(dataset_id, fields_name, lat_bounds, lon_bounds, time_bounds, base_url, max_retries = 3) {
  for(i in 1:max_retries) {
    cat(sprintf("Attempt %d of %d for %s...\n", i, max_retries, dataset_id))
    
    result <- tryCatch({
      data_info <- rerddap::info(dataset_id, url = base_url)
      
      rerddap::griddap(
        data_info,
        time = time_bounds,
        latitude = lat_bounds,
        longitude = lon_bounds,
        fields = fields_name,
        url = base_url
      )
    }, error = function(e) {
      cat("Error caught:", e$message, "\n")
      return(NULL)
    })
    
    if (!is.null(result)) {
      cat("Success!\n")
      return(result)
    }
    
    if (i < max_retries) {
      cat("Waiting 10 seconds before retrying...\n")
      Sys.sleep(10)
    }
  }
  stop(sprintf("Failed to fetch %s after %d attempts. Server may be down.", dataset_id, max_retries))
}

cat("Fetching SST from Upwell...\n")
live_sst_raw <- fetch_with_retry(
  dataset_id = "jplMURSST41", 
  fields_name = "analysed_sst", 
  lat_bounds = c(18, 24), 
  lon_bounds = c(-110, -104), 
  time_bounds = time_window,
  base_url = upwell_url
)

live_sst_weekly <- live_sst_raw$data %>%
  filter(!is.na(analysed_sst)) %>%
  mutate(
    lat_grid = round((latitude - 0.125) / 0.25) * 0.25 + 0.125,
    lon_grid = round((longitude - 0.125) / 0.25) * 0.25 + 0.125
  ) %>%
  group_by(lat_grid, lon_grid) %>%
  summarize(sst_weekly_avg = mean(analysed_sst, na.rm = TRUE), .groups = "drop") %>%
  mutate(pixel_id = as.factor(paste(lat_grid, lon_grid, sep = "_"))) %>%
  select(latitude = lat_grid, longitude = lon_grid, pixel_id, sst_weekly_avg)


cat("Fetching SLA from CoastWatch...\n")
live_sla_raw <- fetch_with_retry(
  dataset_id = "noaacwBLENDEDsshDaily", 
  fields_name = "sla", 
  lat_bounds = c(18, 24), 
  lon_bounds = c(-110, -104), 
  time_bounds = time_window,
  base_url = coastwatch_url
)

live_sla_weekly <- live_sla_raw$data %>%
  filter(!is.na(sla)) %>%
  mutate(pixel_id = as.factor(paste(round(latitude, 3), round(longitude, 3), sep = "_"))) %>%
  group_by(pixel_id) %>%
  summarize(sla_weekly_avg = mean(sla, na.rm = TRUE), .groups = "drop")

live_forecast <- live_sst_weekly %>%
  inner_join(live_sla_weekly, by = 'pixel_id') %>%
  mutate(
    sst_scaled = as.numeric((sst_weekly_avg - SST_TRAIN_MEAN) / SST_TRAIN_SD),
    sla_scaled = as.numeric((sla_weekly_avg - SLA_TRAIN_MEAN) / SLA_TRAIN_SD),
    oni_lag8 = CURRENT_ONI,
    month = as.numeric(format(Sys.Date(), "%m"))
  ) %>%
  filter(!is.na(sst_scaled) & !is.na(sla_scaled))

cat("Loading GAM model and predicting...\n")
gam_model <- readRDS("gam_model_shrunk.rds")

live_forecast$predicted_log_chlor <- predict(gam_model, newdata = live_forecast)
live_forecast$predicted_chlor_actual <- exp(live_forecast$predicted_log_chlor)

cat("Generating forecast map...\n")
forecast_plot <- ggplot(live_forecast, aes(x = longitude, y = latitude, fill = predicted_chlor_actual)) +
  geom_tile() +
  scale_fill_viridis_c(option = "viridis", name = "Chl-a", trans = "log10") +
  annotation_borders("world", colour = "black", fill = NA) +
  coord_quickmap(xlim = c(-110, -104), ylim = c(18, 24)) +
  theme_minimal()

if (!dir.exists("output")) { dir.create("output") }

ggsave("output/latest_forecast_map.png", plot = forecast_plot, width = 10, height = 7, dpi = 300)
write.csv(live_forecast, "output/latest_forecast.csv", row.names = FALSE)
cat("Pipeline complete!\n")