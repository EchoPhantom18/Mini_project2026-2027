// ===========================================================================
// JALDHRISHTI — Script 2: Export Flood Labels + Rainfall (Filtered)
// ===========================================================================
// PURPOSE: Export flood label + CHIRPS rainfall rasters for SELECTED events.
//
// BEFORE RUNNING:
//   1. Run gee_select_events.js to get the filtered event ID list
//   2. Paste the EVENT_IDS array from that script's Console output below
//   3. Click "Run"
//   4. Go to Tasks tab → click "Run" on each task
//
// LABELLING LOGIC (unchanged):
//   Label = 1: flooded==1 AND jrc_perm_water==0 AND clear_views >= 3
//   Label = 0: flooded==0 AND jrc_perm_water==0 AND clear_views >= 3
//   NoData:    jrc_perm_water==1 OR clear_views < 3
// ===========================================================================


// ===================== PASTE SELECTED EVENT IDS HERE =====================
// Replace the placeholder below with the output from gee_select_events.js.
// Example:
// var EVENT_IDS = ['4318', '4055', '3885', '2816', ...];

var EVENT_IDS = [
  'DFO_4665_From_20180802_to_20180810',
  'DFO_3128_From_20070712_to_20071010',
  'DFO_2507_From_20040620_to_20041007',
  'DFO_3636_From_20100418_to_20100421',
  'DFO_2248_From_20030611_to_20031010',
  'DFO_3136_From_20070721_to_20071015',
  'DFO_4176_From_20140815_to_20140908',
  'DFO_3372_From_20080830_to_20080908',
  'DFO_4288_From_20150813_to_20150911',
  'DFO_2519_From_20040705_to_20040811',
  'DFO_3713_From_20100905_to_20100917',
  'DFO_4178_From_20140820_to_20140908',
  'DFO_3371_From_20080830_to_20080908',
  'DFO_2879_From_20060531_to_20060724',
  'DFO_2690_From_20050707_to_20050727',
  'DFO_4508_From_20170810_to_20170826',
  'DFO_4259_From_20150602_to_20150629',
  'DFO_4382_From_20160725_to_20160826',
  'DFO_3856_From_20110815_to_20110908',
  'DFO_3530_From_20090818_to_20090827',
  'DFO_1974_From_20020621_to_20020828',
  'DFO_4483_From_20170602_to_20170703',
  'DFO_2961_From_20060824_to_20060920',
  'DFO_4355_From_20160420_to_20160501',
  'DFO_2676_From_20050623_to_20050630',
  'DFO_3496_From_20090703_to_20090706',
  'DFO_1641_From_20000918_to_20001021'
];

// ===================== CONFIGURATION =====================

var CLEAR_VIEWS_THRESHOLD = 3;
var DRIVE_FOLDER_FLOOD    = 'jaldhrishti_flood_extent';
var DRIVE_FOLDER_RAIN     = 'jaldhrishti_rainfall';
var FLOOD_SCALE           = 250;    // MODIS native (meters)
var RAIN_SCALE            = 5566;   // CHIRPS native ~0.05°


// ===================== VALIDATION =====================

if (EVENT_IDS.length === 0) {
  print('ERROR: EVENT_IDS is empty!');
  print('Run gee_select_events.js first, then paste the event ID array above.');
  throw new Error('No events selected. Paste EVENT_IDS from Script 1b.');
}

print('Exporting ' + EVENT_IDS.length + ' events...');
print('');


// ===================== BOUNDARIES =====================

var assam = ee.FeatureCollection('FAO/GAUL/2015/level1')
              .filter(ee.Filter.eq('ADM1_NAME', 'Assam'));
var assamGeom = assam.geometry();


// ===================== DATA SOURCES =====================

var gfd    = ee.ImageCollection('GLOBAL_FLOOD_DB/MODIS_EVENTS/V1');
var chirps = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY');


// ===================== EXPORT LOOP =====================

for (var i = 0; i < EVENT_IDS.length; i++) {

  var eventId = EVENT_IDS[i];

  // Load this specific event image by its system:index
  var img = ee.Image('GLOBAL_FLOOD_DB/MODIS_EVENTS/V1/' + eventId);

  var startDate = img.date();
  var dateStr   = startDate.format('YYYY-MM-dd').getInfo();
  var dateTag   = dateStr.replace(/-/g, '');   // e.g. "20170712"


  // ----- A. FLOOD LABEL RASTER -----

  var flooded    = img.select('flooded');
  var clearViews = img.select('clear_views');
  var permWater  = img.select('jrc_perm_water');

  // Reliability mask: enough clear views AND not permanent water
  var reliableMask = clearViews.gte(CLEAR_VIEWS_THRESHOLD)
                               .and(permWater.eq(0));

  // Clean label: 1=flooded, 0=not-flooded, NoData=unreliable/perm-water
  var cleanLabel = flooded.updateMask(reliableMask)
                          .clip(assamGeom)
                          .rename('flood_label');

  // QA band
  var clearViewsClipped = clearViews.clip(assamGeom)
                                    .rename('clear_views');

  var floodExport = cleanLabel.addBands(clearViewsClipped).toInt16();

  Export.image.toDrive({
    image:          floodExport,
    description:    'flood_label_' + dateTag + '_' + eventId,
    folder:         DRIVE_FOLDER_FLOOD,
    fileNamePrefix: 'flood_label_' + dateTag + '_' + eventId,
    region:         assamGeom,
    scale:          FLOOD_SCALE,
    crs:            'EPSG:4326',
    maxPixels:      1e9
  });


  // ----- B. CHIRPS RAINFALL RASTER -----

  var rain7 = chirps
    .filterDate(startDate.advance(-7, 'day'), startDate)
    .filterBounds(assamGeom)
    .sum()
    .clip(assamGeom)
    .rename('rain_7d_mm');

  var rain15 = chirps
    .filterDate(startDate.advance(-15, 'day'), startDate)
    .filterBounds(assamGeom)
    .sum()
    .clip(assamGeom)
    .rename('rain_15d_mm');

  var rain30 = chirps
    .filterDate(startDate.advance(-30, 'day'), startDate)
    .filterBounds(assamGeom)
    .sum()
    .clip(assamGeom)
    .rename('rain_30d_mm');

  var rainExport = rain7.addBands(rain15).addBands(rain30).toFloat();

  Export.image.toDrive({
    image:          rainExport,
    description:    'rain_' + dateTag + '_' + eventId,
    folder:         DRIVE_FOLDER_RAIN,
    fileNamePrefix: 'rain_' + dateTag + '_' + eventId,
    region:         assamGeom,
    scale:          RAIN_SCALE,
    crs:            'EPSG:4326',
    maxPixels:      1e9
  });

  print('  [' + (i+1) + '/' + EVENT_IDS.length + '] ' +
        eventId + ' (' + dateStr + ') — tasks created');
}


// ===================== SUMMARY =====================

print('');
print('=== ALL TASKS CREATED ===');
print('Flood labels: ' + EVENT_IDS.length + ' → Drive: ' + DRIVE_FOLDER_FLOOD);
print('Rainfall:     ' + EVENT_IDS.length + ' → Drive: ' + DRIVE_FOLDER_RAIN);
print('');
print('Go to Tasks tab → click "Run" on each task.');
print('After download, place files in:');
print('  data/raw/flood_extent/   (flood_label_*.tif)');
print('  data/raw/rainfall/       (rain_*.tif)');
