const serialize = require('./serialize').serialize
const Options = require('./Options').Options
const STRING_CODE = 2
var TYPE_CODE = 3
var NULL = 0 // p
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
	EmptyPrimitiveSlot.createPropertyWriter = function(charEncoder, index) {
		return function(slot) {
			var first = true
			for (entry of values) {
			console.log('writing value', index, entry)
				var count = entry[1]
				if (count > COUNT_THRESHOLD) {
					if (first) {
						first = false
					} else {
						charEncoder.writeToken(0, index)
					}
					var string = entry[0]
					charEncoder.writeToken(STRING_CODE, string.length)
					charEncoder.writeString(string)
				}
			}
			if (first) {
				// no other value provided, just provide a value of null
				charEncoder.writeToken(TYPE_CODE, NULL)
			}
		}
	}
	return EmptyPrimitiveSlot
}
exports.createSharedStructure = createSharedStructure


// property id ranges:
// shared: 0 - 511
// instance: 512+
// shared: 

function makeShared(onUpdate, sharedProperty, activeList) {
	let hasUpdates
	if (!sharedProperty)
		sharedProperty = []
	if (!activeList)
		activeList = []
	sharedProperty.getProperty = (value, key, type, extendedType, writeProperty, writeToken, lastPropertyIndex) => {
		let propertyIndex = -1
		let thisProperty = sharedProperty.instance
		if (!thisProperty) {
			sharedProperty.instance
			activeList.push(sharedProperty)
		}
		// resume property search through the instance section
		do {
			property = thisProperty[++propertyIndex]
		} while(property && (property.key !== key ||
				(property.type !== type && type !== 'boolean' && type !== 'undefined' && value !== null) ||
				(extendedType && property.extendedType !== constructor)))
		if (property) {
			// found a match, reference it (in the instance range)
			propertyIndex += 512
			writeToken(PROPERTY_CODE, propertyIndex)
			return propertyIndex
		} else {
			let counts = property.counts
			if (!counts) {
				property.counts = new Map()
			}
			let count = counts.get(key) || 0
			if (count > COUNT_THRESHOLD) {
				// create a new shared property
				if (lastPropertyIndex !== thisProperty.length) {
					writeToken(PROPERTY_CODE, propertyIndex = thisProperty.length)
					sparse = true
				}
				property = thisProperty[propertyIndex = lastPropertyIndex] = writeProperty(value, key, type, extendedType, propertyIndex)
				makeShared(onUpdate, property, activeList)
				hasUpdates = true
				counts.delete(key) // don't need it anymore
				return propertyIndex
			} else {
				// increment the count and return a new instance property
				count++
				if (lastPropertyIndex !== thisProperty.length) {
					writeToken(PROPERTY_CODE, propertyIndex = thisProperty.length)
					sparse = true
				}
				property = thisProperty[propertyIndex = lastPropertyIndex] = writeProperty(value, key, type, extendedType, propertyIndex)
				return propertyIndex + 512
			}
		}
	}
	sharedProperty.reset = () => {
		for (let property of activeList) {
			property.instance = null
			let counts = property.counts
			for ([key, count] of property.counts) {
				count = count >> 1
				if (count)
					counts.set(key, count)
				else
					counts.delete(key)
			}
			if (counts.size == 0) {
				activeList.splice(activeList.indexOf(property))
			}
		}
	}
	sharedProperty.writeSharedValue = (value) => {
		sharedProperty
	}
	return sharedProperty
}