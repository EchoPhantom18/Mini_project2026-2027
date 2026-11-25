// ===========================================================================
// JALDHRISHTI — Script 1b: Select Best Events
// ===========================================================================
// PURPOSE: From the 126 events intersecting Assam, select ~20-30 with
//          the largest flooded area, spread across different years.
//          Prints event IDs + dates for the selected subset.
//          Copy the printed EVENT_IDS list into Script 2.
//
// WHY FILTER:
//   - 126 events × 2 exports = 252 tasks → too many for one session
//   - Many events may be tiny (small corner of Assam barely clipped)
//   - We want diverse training data: big events across many years
//
// HOW TO USE:
//   1. Paste into GEE Code Editor
//   2. Click "Run"
//   3. Console prints the selected events and a copy-paste list
//   4. Copy the EVENT_IDS array into Script 2 (gee_export.js)
// ===========================================================================


// --- Config ---
var MAX_EVENTS_PER_YEAR = 2;   // at most 2 events per year (pick largest)
var MIN_FLOODED_PIXELS  = 100; // event must have >= 100 flooded pixels in Assam

// --- Assam boundary ---
var assam = ee.FeatureCollection('FAO/GAUL/2015/level1')
              .filter(ee.Filter.eq('ADM1_NAME', 'Assam'));
var assamGeom = assam.geometry();

// --- Load flood events ---
var gfd = ee.ImageCollection('GLOBAL_FLOOD_DB/MODIS_EVENTS/V1');
var assamFloods = gfd.filterBounds(assamGeom);

// --- For each event, compute number of flooded pixels inside Assam ---
// We use a lightweight approach: reduceRegion on the entire Assam boundary
// (single polygon, not per-district, so it won't freeze)
var withStats = assamFloods.map(function(img) {
  // Count flooded pixels (flooded==1, excluding permanent water)
  var flooded = img.select('flooded');
  var permWater = img.select('jrc_perm_water');
  var floodOnly = flooded.updateMask(permWater.eq(0));

  var stats = floodOnly.reduceRegion({
    reducer: ee.Reducer.sum(),   // sum of 1s = count of flooded pixels
    geometry: assamGeom,
    scale: 1000,                 // coarse scale for speed (1 km)
    maxPixels: 1e8,
    bestEffort: true
  });

  var floodedCount = ee.Number(stats.get('flooded')).max(0);

  return img.set({
    'flooded_pixel_count': floodedCount,
    'event_year': img.date().get('year'),
    'event_date_str': img.date().format('YYYY-MM-dd'),
    'event_id': img.get('system:index')
  });
});

// --- Filter out tiny events ---
var significant = withStats.filter(
  ee.Filter.gte('flooded_pixel_count', MIN_FLOODED_PIXELS)
);

print('Events with >= ' + MIN_FLOODED_PIXELS + ' flooded pixels:', significant.size());

// --- Sort by flooded pixel count (descending) ---
var sorted = significant.sort('flooded_pixel_count', false);

// --- Select top events per year ---
// We do this client-side since we need to group and limit per year.
var allEvents = sorted.aggregate_array('event_id').getInfo();
var allYears  = sorted.aggregate_array('event_year').getInfo();
var allDates  = sorted.aggregate_array('event_date_str').getInfo();
var allCounts = sorted.aggregate_array('flooded_pixel_count').getInfo();

var yearCount = {};     // track how many events we've picked per year
var selected  = [];     // final selected events

for (var i = 0; i < allEvents.length; i++) {
  var yr = allYears[i];
  if (!yearCount[yr]) yearCount[yr] = 0;

  if (yearCount[yr] < MAX_EVENTS_PER_YEAR) {
    yearCount[yr]++;
    selected.push({
      id:    allEvents[i],
      date:  allDates[i],
      year:  yr,
      count: Math.round(allCounts[i])
    });
  }
}

// --- Print results ---
print('');
print('=== SELECTED EVENTS: ' + selected.length + ' ===');
print('(Top ' + MAX_EVENTS_PER_YEAR + ' per year by flooded area, minimum ' + MIN_FLOODED_PIXELS + ' pixels)');
print('');

var idList = [];
for (var j = 0; j < selected.length; j++) {
  var e = selected[j];
  idList.push(e.id);
  print((j+1) + '. ' + e.id + '  |  ' + e.date +
        '  |  year=' + e.year +
        '  |  flooded_pixels≈' + e.count);
}

print('');
print('Years represented:', Object.keys(yearCount).sort());
print('');

// --- Print copy-paste array for Script 2 ---
print('=== COPY THIS INTO SCRIPT 2 (gee_export.js) ===');
print("var EVENT_IDS = ['" + idList.join("', '") + "'];");
