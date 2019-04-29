const serialize = require('./serialize').serialize
const Options = require('./Options').Options
const STRING_CODE = 2
var PROPERTY_CODE = 0
var NUMBER_CODE = 1
var TYPE_CODE = 3
var END_SEQUENCE = 5 // u

var NULL = 0 // p

var REFERENCING_POSITION = 12 // |
var TYPE_ONLY = 13 // } for defining a typed object without returning the value
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

function serializeSharedStructure(sharedProperty) {
	var writers = createSerializer().getWriters()
	writers.writeToken(TYPE_CODE, TYPE_ONLY)
	serializeSharedProperty(sharedProperty)
}

function serializeSharedProperty(sharedProperty, writers) {
	writeProperty(null, sharedProperty.key, sharedProperty.type)
	var length = sharedProperty.length
	if (length > 0) {
		let needsEnd = length > 14
		writers.writeToken(SEQUENCE_CODE, needsEnd ? 15 : length)
		for (var i = 0; i < length; i++) {
			serializeSharedProperty(sharedProperty[i], writers)
		}
		if (needsEnd)
			writers.writeToken(TYPE_CODE, END_SEQUENCE)
	} else if (sharedProperty.values && sharedProperty.values.length > 0) {
		var values = sharedProperty.values
		var length = values.length
		var first = true
		for (var i = 0; i < length; i++) {
			if (first)
				first = false
			else // reset property code for each subsequent value so we don't move on to the next property in parsing
				writers.writeToken(PROPERTY_CODE, sharedProperty.index)
			writers.writeAsDefault(values[i])
		}
	} else {
		writers.writeToken(TYPE_CODE, NULL)
	}
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

function createSharedStructure(onUpdate) {
	var instanceProperty = []
	instanceProperty.code = 6
	let activeList = []
	var sharedProperty = makeShared(instanceProperty, activeList)
	sharedProperty.reset = () => {
		for (let i = 0; i < activeList.length; i++) {
			var sharedProperty = activeList[i]
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
			if (instance.values && instance.values.length > 0) {
				sharedProperty.previousValues = instance.values
				instance.values = []
			} else if (instance.length == 0) {
				activeList.splice(i--, 1)
			}
		}
		activeList.splice(0, activeList.length) // clear the whole array
		if (activeList.hasUpdates) {
			activeList.hasUpdates = false
			onUpdate(serializeSharedStructure(sharedProperty))
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
	sharedProperty.code = thisProperty.code
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
		}
		return property
	}
	sharedProperty.writeSharedValue = (value, writeToken) => {
		let sharedValues = this.values
		let instanceValues = thisProperty.values
		let reference = instanceValues.indexOf(value)
		if (reference > -1) {
			writeToken(NUMBER_CODE, reference + 512)
			return true
		}
		if (!sharedProperty.active) {
			sharedProperty.active = true
			activeList.push(sharedProperty)
		}
		let lastIndex = this.lastIndex
		let length = sharedValues.length
		if (length < 32) {
			reference = this.previousValues.indexOf(value)
			if (reference > -1) {
				// add to shared values
				activeList.hasUpdates = true
				sharedValues[length] = value
				if (length != lastIndex) {
					writeToken(TYPE_CODE, REFERENCING_POSITION)
					writeToken(NUMBER_CODE, this.lastIndex = length)
				}
				return false // indicate that the value still needs to be written out
			}
		}
		length = instanceValues.length
		if (length + 512 != lastIndex) {
			// reset the reference position
			writeToken(TYPE_CODE, REFERENCING_POSITION)
			writeToken(NUMBER_CODE, this.lastIndex = length + 512)
		}
		if (length < 12) {
			instanceValues[length] = value
		}
		// return false
	}
	return sharedProperty
}