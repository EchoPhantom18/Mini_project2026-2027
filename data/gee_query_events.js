// ===========================================================================
// JALDHRISHTI — Script 1: Query Events (lightweight)
// ===========================================================================
// PURPOSE: Print how many Global Flood Database events intersect Assam,
//          their start dates, and event IDs. No exports, no heavy compute.
//
// HOW TO USE:
//   1. Paste into https://code.earthengine.google.com/
//   2. Click "Run"
//   3. Check the Console tab for results
//   4. Note down the event count, dates, and IDs
//   5. Then run Script 2 (gee_export.js) to export the actual rasters
// ===========================================================================

// --- Assam boundary ---
var assam = ee.FeatureCollection('FAO/GAUL/2015/level1')
              .filter(ee.Filter.eq('ADM1_NAME', 'Assam'));
var assamGeom = assam.geometry();

// --- Global Flood Database ---
var gfd = ee.ImageCollection('GLOBAL_FLOOD_DB/MODIS_EVENTS/V1');
var assamFloods = gfd.filterBounds(assamGeom);

// --- Print summary (all server-side, no getInfo loop) ---
print('=== JALDHRISHTI: Assam Flood Events ===');
print('');
print('Total events intersecting Assam:', assamFloods.size());

print('');
print('Event IDs:', assamFloods.aggregate_array('system:index'));

// Start dates as readable strings
var startDates = assamFloods.aggregate_array('system:time_start')
                   .map(function(ts) { return ee.Date(ts).format('YYYY-MM-dd'); });
print('Event start dates:', startDates);

// Distinct years
var years = assamFloods.aggregate_array('system:time_start')
              .map(function(ts) { return ee.Date(ts).get('year'); })
              .distinct().sort();
print('Years covered:', years);

// --- Visual check: show Assam boundary on the map ---
Map.centerObject(assamGeom, 7);
Map.addLayer(assamGeom, {color: 'blue'}, 'Assam boundary');

print('');
print('Done. Note the event count and dates above,');
print('then run Script 2 (gee_export.js) to export rasters.');
