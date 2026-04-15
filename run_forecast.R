# Load libraries quietly
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

live_sst_raw <- griddap(
  datasetx = "jplMURSST41",
  time = time_window,
  latitude = c(18, 24),
  longitude = c(-110, -104),
  fields = "analysed_sst"
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

live_sla_raw <- griddap(
  datasetx = "noaacwBLENDEDsshDaily",
  url = "https://coastwatch.noaa.gov/erddap/",
  time = time_window,
  latitude = c(18, 24),
  longitude = c(-110, -104),
  fields = "sla"
)

live_sla_weekly <- live_sla_raw$data %>%
  filter(!is.na(sla)) %>%
  mutate(pixel_id = as.factor(paste(round(latitude, 3), round(longitude, 3), sep = "_"))) %>%
  group_by(pixel_id) %>%
  summarize(sla_weekly_avg = mean(sla, na.rm = TRUE), .groups = "drop")

live_forecast <- live_sst_weekly %>%
  inner_join(live_sla_weekly, by = 'pixel_id') %>%
  mutate(
    # Safely scale using your 15-year baseline anchors
    sst_scaled = as.numeric((sst_weekly_avg - SST_TRAIN_MEAN) / SST_TRAIN_SD),
    sla_scaled = as.numeric((sla_weekly_avg - SLA_TRAIN_MEAN) / SLA_TRAIN_SD),
    oni_lag8 = CURRENT_ONI,
    month = as.numeric(format(Sys.Date(), "%m"))
  ) %>%
  # Drop NAs to prevent prediction errors
  filter(!is.na(sst_scaled) & !is.na(sla_scaled))

cat("Loading GAM model and predicting...\n")
gam_model <- readRDS("gam_model_shrunk.rds")

live_forecast$predicted_log_chlor <- predict(gam_model, newdata = live_forecast)
live_forecast$predicted_chlor_actual <- exp(live_forecast$predicted_log_chlor)

cat("Generating forecast map...\n")
forecast_plot <- ggplot(live_forecast, aes(x = longitude, y = latitude, fill = predicted_chlor_actual)) +
  geom_tile() +
  scale_fill_viridis_c(option = "viridis", name = "Chl-a", trans = "log10") +
  borders("world", colour = "black", fill = NA) +
  coord_quickmap(xlim = c(-110, -104), ylim = c(18, 24)) +
  theme_minimal()

if (!dir.exists("output")) { dir.create("output") }

ggsave("output/latest_forecast_map.png", plot = forecast_plot, width = 10, height = 7, dpi = 300)
write.csv(live_forecast, "output/latest_forecast.csv", row.names = FALSE)