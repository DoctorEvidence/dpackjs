const serialize = require('./serialize').serialize
const Options = require('./Options').Options
const STRING_CODE = 2
var PROPERTY_CODE = 0
var TYPE_CODE = 3
var NULL = 0 // p
var COUNT_THRESHOLD = 2

/*function createSharedStructure(objects) {
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
}*/

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

function createSharedStructure(onUpdate) {
	var instanceProperty = []
	instanceProperty.code = 6
	let activeList = []
	var sharedProperty = makeShared(instanceProperty, activeList)
	sharedProperty.reset = () => {
		for (let sharedProperty of activeList) {
			sharedProperty.active = false
			let instance = sharedProperty.instance
			for (let j = 0; j < instance.length; j++) {
				let property = instance[j]
				if (property.firstUse) {
					property.firstUse = false
				} else {
					instance.splice(j--, 1)
				}
			}
		}
		activeList.splice(0, activeList.length) // clear the whole array
		if (activeList.hasUpdates) {
			activeList.hasUpdates = false
			onUpdate()
		}
	}

	return sharedProperty
}

// property id ranges:
// shared: 0 - 511
// instance: 512+
// shared: 

function makeShared(thisProperty, activeList) {
	let hasUpdates
	let sharedProperty = []
	sharedProperty.instance = thisProperty
	sharedProperty.writeValue = thisProperty.writeValue
	sharedProperty.getProperty = (value, key, type, extendedType, writeProperty, writeToken, lastPropertyIndex) => {
		let propertyIndex = -1
		let thisProperty = sharedProperty.instance
		if (!sharedProperty.active) {
			sharedProperty.active = true
			activeList.push(sharedProperty)
		}
		// resume property search through the instance section
		do {
			property = thisProperty[++propertyIndex]
		} while(property && (property.key !== key ||
				(property.type !== type && type !== 'boolean' && type !== 'undefined' && value !== null) ||
				(extendedType && property.extendedType !== constructor)))
		if (property) {
			// found a match, if not first use, upgrade to a shared property
			if (!property.firstUse) {
				// create a new shared property
				propertyIndex = sharedProperty.length
				if (lastPropertyIndex !== propertyIndex) {
					writeToken(PROPERTY_CODE, propertyIndex)
				}
				writeProperty(value, key, type, extendedType, propertyIndex)
				property = makeShared(property, activeList)
				sharedProperty[propertyIndex] = property
				property.index = propertyIndex
				activeList.hasUpdates = true
			} else {
				// write the reference to the property
				writeToken(PROPERTY_CODE, propertyIndex + 512)
			}
		} else  {
			// return a new instance property
			propertyIndex = thisProperty.length + 512
			if (lastPropertyIndex !== propertyIndex) {
				writeToken(PROPERTY_CODE, propertyIndex)
			}
			property = thisProperty[propertyIndex - 512] = writeProperty(value, key, type, extendedType, propertyIndex)
			property.firstUse = true
			property.index = propertyIndex
			activeList
		}
		return property
	}
	sharedProperty.writeSharedValue = (value) => {
		sharedProperty
	}
	return sharedProperty
}