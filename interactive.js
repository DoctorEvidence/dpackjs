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
}
function updateStats() {
	document.getElementById('json-stats').textContent = new TextEncoder().encode(JSON.stringify(data)).length + ' bytes (without indentation)'
	document.getElementById('dpack-stats').textContent = new TextEncoder().encode(dpack.serialize(data)).length + ' bytes'
}
