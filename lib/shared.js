const createSerializer = require('./serialize').createSerializer
const Options = require('./Options').Options
const STRING_CODE = 2
var PROPERTY_CODE = 0
var NUMBER_CODE = 1
var TYPE_CODE = 3
var SEQUENCE_CODE = 7

var END_SEQUENCE = 5 // u

var NULL = 0 // p

var REFERENCING_POSITION = 12 // |
var TYPE_ONLY = 13 // } for defining a typed object without returning the value
var COUNT_THRESHOLD = 2

function serializeSharedStructure(sharedProperty) {
	var serializer = createSerializer()
	var writers = serializer.getWriters()
	writers.writeToken(TYPE_CODE, TYPE_ONLY)
	serializeSharedProperty(sharedProperty, writers)
	return serializer.getSerialized()
}

function serializeSharedProperty(sharedProperty, writers, isLast) {
	writers.writeProperty(null, sharedProperty.key, sharedProperty.type)
	var length = sharedProperty.length
	if (length > 0) {
		let needsEnd = length > 14
		writers.writeToken(SEQUENCE_CODE, needsEnd ? 15 : length)
		for (var i = 0; i < length; i++) {
			serializeSharedProperty(sharedProperty[i], writers, i == length - 1)
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
	} else if (isLast) {
		// due to the parsing difficult in parsing a create-property token with no value at the end of a
		// sequence, we provide a value to the last property
		writers.writeToken(TYPE_CODE, NULL)
	}
}

exports.createSharedStructure = createSharedStructure

function createSharedStructure(onUpdate) {
	var instanceProperty = []
	instanceProperty.key = null
	instanceProperty.code = 6
	instanceProperty.type = 'object'
	let activeList = []
	var sharedProperty = makeShared(instanceProperty, activeList)
	resetSerializer(sharedProperty)
	sharedProperty.reset = () => {
		for (let i = 0; i < activeList.length; i++) {
			let activeSharedProperty = activeList[i]
			let instance = activeSharedProperty.instance
			for (let j = 0; j < instance.length; j++) {
				let property = instance[j]
				if (property.firstUse) {
					property.firstUse = false
				} else {
					instance.splice(j--, 1)
				}
			}
			if (instance.values && instance.values.length > 0) {
				activeSharedProperty.previousValues = instance.values
				instance.values = []
			} else if (instance.length == 0) {
				activeSharedProperty.active = false
				activeList.splice(i--, 1)
			}
		}
		if (activeList.hasUpdates) {
			activeList.hasUpdates = false
			resetSerializer(sharedProperty)
			if (onUpdate)
				onUpdate()
		}
	}

	return sharedProperty
}

function resetSerializer(sharedProperty) {
	Object.defineProperty(sharedProperty, 'serialized', {
		configurable: true,
		get: function() {
			Object.defineProperty(sharedProperty, 'serialized', {
				configurable: true,
				value: serializeSharedStructure(this)
			})
			return this.serialized
		}
	})
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
	sharedProperty.key = thisProperty.key
	sharedProperty.type = thisProperty.type
	if (typeof thisProperty.values == 'object') {
		sharedProperty.previousValues = thisProperty.values
		thisProperty.values = []
		sharedProperty.values = []
		sharedProperty.lastIndex = 0
	}
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
	sharedProperty.writeSharedValue = function(value, writeToken) {
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
				writeToken(NUMBER_CODE, length)
				return true
			}
		}
		length = instanceValues.length
		if (length + 512 != lastIndex) {
			// reset the reference position in the instance serialization
			writeToken(TYPE_CODE, REFERENCING_POSITION)
			writeToken(NUMBER_CODE, this.lastIndex = length + 512)
		}
		if (length < 12) {
			instanceValues[length] = value
		}
		// return falsy to indicate it still needs to be written out in the instance serialization
	}
	return sharedProperty
}