var dpackText = document.getElementById('dpack')
var jsonText = document.getElementById('json')
document.getElementById('convert-to-json').onclick = function() {
	jsonText.value = JSON.stringify(data = dpack.parse(dpackText.value), null, '  ')
	updateStats()
}
document.getElementById('convert-to-dpack').onclick = function() {
	dpackText.value = dpack.serialize(data = JSON.parse(jsonText.value))
	updateStats()
}

serialize = function() {
	dpackText.value = dpack.serialize(data)
	jsonText.value = JSON.stringify(data, null, '  ')
	updateStats()
}
function updateStats() {
	document.getElementById('json-stats').textContent = new TextEncoder().encode(JSON.stringify(data)).length + ' bytes (without indentation)'
	document.getElementById('dpack-stats').textContent = new TextEncoder().encode(dpack.serialize(data)).length + ' bytes'
}
data = [
  {
    "feature": "Referencing/reuse of properties and values",
    "benefit": "Compact representation, fast parsing"
  },
  {
    "feature": "Valid unicode format",
    "benefit": "Fast single-pass text decoding, broad support"
  },
  {
    "feature": "Extensible types",
    "benefit": "Beyond objects and arrays, support for maps, sets, dates, and user-defined types"
  },
  {
    "feature": "Seperable blocks",
    "benefit": "Support for on-demand parsing of properties/sub-objects"
  },
  {
    "feature": "Referencing values",
    "benefit": "Represent complex graph-like and circular structures"
  },
  {
    "feature": "Streaming, progressive parsing",
    "benefit": "Data parsed during download, for in progress data access and concurrency"
  }
]
serialize()
