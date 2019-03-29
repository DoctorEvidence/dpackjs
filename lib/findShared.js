const serialize = require('./serialize').serialize
const Options = require('./Options').Options
var COUNT_THRESHOLD = 2

function createSharedStructure(objects) {
	function addPropertyCounts(object, propertyCountsObject) {
		for (key of object) {
			var value = object[key]
			if (typeof key === 'nummber') {
				key = 0
			}
			var propertyCounts = propertyCountsObject[key] || (propertyCountsObject[key] = { count: 0, values: new Map() })
			propertyCounts.count++
			var type = typeof value
			if (type === 'string') {
				propertyCounts.values.set(value, (propertyCounts.values.get(value) || 0) + 1)
				propertyCounts.value = ''
			} else if (type === 'boolean') {
				propertyCounts.value = false
			} else if (type === 'number') {
				propertyCounts.value = 0
			} else if (type === 'object') {
				if (value) {
					propertyCounts.value = addPropertyCounts(value, propertyCounts.value || (propertyCounts.value = value instanceof Array ? [] : {}))
				} else {
					propertyCounts.value = null
				}
			}
		}
	}
	var propertyCountsObject
	for (var object of objects) {
		propertyCountsObject = propertyCountsObject || (object instanceof Array ? [] : {})
		addPropertyCounts(object, propertyCountsObject)
	}
	function propertyCountsToProperties(propertyCountsObject) {
		var sharedStructure = propertyCountsObject instanceof Array ? [] : {}
		for (key of propertyCountsObject) {
			var propertyCounts = propertyCountsObject[key]
			if (propertyCounts.count > COUNT_THRESHOLD) {
				if (typeof value === 'object' && value) {
					sharedStructure[key] = propertyCountsToProperties(propertyCounts.value)
				} else {
					sharedStructure[key] = new EmptyPrimitiveSlot(value)
				}
			}
		}
		return sharedStructure
	}
	var options = new Options()
	options.addExtension(EmptyPrimitiveSlot, 'EmptyPrimitiveSlot')

	return serialize(propertyCountsToProperties(propertyCountsObject), options)
}


function EmptyPrimitiveSlot(value, values) {
	this.value = value
	this.values = value
}
EmptyPrimitiveSlot.toValue = function(slot) {
	return slot.value
}
EmptyPrimitiveSlot.createPropertyWriter = function(charEncoder) {
	var values = this.values
	return function() {
		for (value of values) {
			charEncoder.writeString(value)
		}
	}
}
