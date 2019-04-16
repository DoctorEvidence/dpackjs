const serialize = require('./serialize').serialize
const Options = require('./Options').Options
var COUNT_THRESHOLD = 2

function createSharedStructure(objects) {
	function addPropertyCounts(object, propertyCountsObject) {
		for (key in object) {
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
					addPropertyCounts(value, propertyCounts.value || (propertyCounts.value = value instanceof Array ? [] : {}))
				} else {
					propertyCounts.value = null
				}
			}
		}
	}
	var options = new Options()
	var propertyCountsObject
	for (var object of objects) {
		propertyCountsObject = propertyCountsObject || (object instanceof Array ? [] : {})
		addPropertyCounts(object, propertyCountsObject)
	}
	function propertyCountsToProperties(propertyCountsObject) {
		var sharedStructure = propertyCountsObject instanceof Array ? [] : {}
		for (key in propertyCountsObject) {
			var propertyCounts = propertyCountsObject[key]
			if (propertyCounts.count > COUNT_THRESHOLD) {
				var value = propertyCounts.value
				if (typeof value === 'object' && value) {
					sharedStructure[key] = propertyCountsToProperties(value)
				} else {
					var EmptyPrimitiveSlot = createEmptyPrimitiveSlot(propertyCounts.values)
					options.addExtension(EmptyPrimitiveSlot, 'EmptyPrimitiveSlot')
					sharedStructure[key] = new EmptyPrimitiveSlot(value)
				}
			}
		}
		return sharedStructure
	}
console.log(propertyCountsObject.Enum.value)
	return serialize(propertyCountsToProperties(propertyCountsObject), options)
}

function createEmptyPrimitiveSlot(values) {
	function EmptyPrimitiveSlot(value) {
		this.value = value
	}
	EmptyPrimitiveSlot.toValue = function(slot) {
		return slot.value
	}
	EmptyPrimitiveSlot.createPropertyWriter = function(charEncoder) {
		return function(slot) {
			var first = true
			for (entry of values) {
			console.log('writing value', this.index, entry)
				var count = entry[1]
				if (count > COUNT_THRESHOLD) {
					if (first) {
						first = false
					} else {
						charEncoder.writeToken(0, this.index)
					}
					charEncoder.writeString(entry[0])
				}
			}
		}
	}
	return EmptyPrimitiveSlot
}
exports.createSharedStructure = createSharedStructure
