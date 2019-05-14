const createSerializer = require('./serialize').createSerializer
const createParser = require('./parse').createParser
const Options = require('./Options').Options
const STRING_CODE = 2
var PROPERTY_CODE = 0
var NUMBER_CODE = 1
var TYPE_CODE = 3
var SEQUENCE_CODE = 7

var DEFAULT_TYPE = 6
var ARRAY_TYPE = 7
var REFERENCING_TYPE = 8
var NUMBER_TYPE = 9

var NULL = 0 // p

var REFERENCING_POSITION = 13
var TYPE_DEFINITION = 14 // ~  // for defining a typed object without returning the value

var OPEN_SEQUENCE = 12 // <
var END_SEQUENCE = 14 // >

var COUNT_THRESHOLD = 2

exports.createSharedStructure = createSharedStructure

function createSharedStructure(from, options) {
	var instanceProperty = []
	instanceProperty.key = null
	instanceProperty.code = 6
	instanceProperty.type = 'object'
	let activeList = []
	let needsCleanup = []
	var sharedProperty = makeShared(instanceProperty, activeList, needsCleanup)
	sharedProperty.blockStructure = sharedProperty
	sharedProperty.version = 1
	resetSerializer(sharedProperty)
	sharedProperty.writeReset = function(canUpdate) {
		for (let i = 0; i < activeList.length; i++) {
			let activeSharedProperty = activeList[i]
			let instance = activeSharedProperty.instance
			if (sharedProperty.isFrozen) {
				// clear the whole list if frozen
				instance.length = 0
			} else {
				for (let j = 0; j < instance.length; j++) {
					let property = instance[j]
					if (property.firstUse) {
						property.firstUse = false
					} else {
						instance.splice(j--, 1)
					}
				}
			}
			if (activeSharedProperty.lastIndex) {
				activeSharedProperty.lastIndex = 0
			}
			if (instance.values && instance.values.length > 0) {
				if (!sharedProperty.isFrozen)
					activeSharedProperty.previousValues = instance.values
				instance.values = []
			} else if (instance.length == 0) {
				activeSharedProperty.active = false
				activeList.splice(i--, 1)
			}
		}
		if (activeList.hasUpdates) {
			activeList.hasUpdates = false
			sharedProperty.version++
			resetSerializer(sharedProperty)
			if (options && options.onUpdate)
				options.onUpdate()
		}
	}

	sharedProperty.readReset = function() {
		for (var i = 0, l = needsCleanup.length; i < l; i++) {
			var item = needsCleanup[i]
			item.length = item.resetTo
			if (item.nextPosition > -1)
				item.nextPosition = item.resetTo
				
			item.resetTo = null
		}
		needsCleanup.length = 0
	}

	sharedProperty.freeze = function() {
		this.isFrozen = true
		this.reset()
	}
	if (from) {
		var parser = createParser({
			forDeferred(block, property) {
				property.isBlock = true
				return block
			},
			parseDeferreds: true
		})
		// concatenate shared structure with null so there is a value to parse
		var readProperty = []
		readProperty.code = 6
		readProperty.type = 'object'
		readProperty.key = null
		// start with TYPE_DEFINITION (~) and end with with NULL (p) value to return something from type definition
		parser.setSource('~' + from + 'p').read([readProperty])
		recursivelyShare(readProperty, sharedProperty)
	} else if (options && options.fromProperty) {
		recursivelyShare(options.fromProperty, sharedProperty)
	}

	function recursivelyShare(readProperty, sharedProperty) {
		sharedProperty.type = types[readProperty.code]
		for (var i = 0, l = readProperty.length; i < l; i++) {
			var childProperty = readProperty[i]
			var sharedChildProperty = sharedProperty[i] = makeShared(childProperty, activeList, needsCleanup)
			sharedChildProperty.parent = sharedProperty
			recursivelyShare(childProperty, sharedChildProperty)
			childProperty.length = 0
		}
		if (sharedProperty.previousValues) {
			sharedProperty.values = sharedProperty.previousValues
			sharedProperty.previousValues = []
		}
	}

	return sharedProperty
}
// default type for each code
var types = {
	6/*DEFAULT_TYPE*/: 'object',
	7/*ARRAY_TYPE*/: 'array',
	8/*REFERENCING_TYPE*/: 'string',
	9/*NUMBER_TYPE*/: 'number'
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

function serializeSharedStructure(sharedProperty) {
	var serializer = createSerializer()
	var writers = serializer.getWriters()
	serializeSharedProperty(sharedProperty, writers, true)
	let serialized = serializer.getSerialized()
	console.log('latest serialized', serialized.toString())
	return serialized
}

function serializeSharedProperty(sharedProperty, writers, expectsObjectWithNullKey) {
	if (!(expectsObjectWithNullKey && sharedProperty.type === 'object')) {
		writers.writeProperty(null, sharedProperty.key, sharedProperty.type)
	}
	if (sharedProperty.blockStructure) {
		// use the block structure if there is one
		sharedProperty = sharedProperty.blockStructure
	}
	var length = sharedProperty.length
	if (length > 0) {
		// we always use open sequence, because writing multiple values of a property use extra property counts,
		// plus it is easier to deal with properties without values
		writers.writeToken(SEQUENCE_CODE, OPEN_SEQUENCE)
		for (var i = 0; i < length; i++) {
			sharedProperty[i].index = i
			serializeSharedProperty(sharedProperty[i], writers, sharedProperty.code === ARRAY_TYPE && i === 0)
		}
		writers.writeToken(SEQUENCE_CODE, END_SEQUENCE)
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
	}
}

// property id ranges:
// shared: 0 - 511
// instance: 512+
// shared: 

function makeShared(thisProperty, activeList, needsCleanup) {
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
	function getBlock() {

	}
	// TODO: Create a class that extends Array with all these methods
	sharedProperty.getProperty = function(value, key, type, extendedType, writeProperty, writeToken, lastPropertyIndex, canUpdate) {
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
		if (property && !property.firstUse && !sharedProperty.isFrozen && canUpdate && sharedProperty.length < 512) {
			// found a match, if not first use, upgrade to a shared property
			// create a new shared property
			propertyIndex = sharedProperty.length
			if (lastPropertyIndex !== propertyIndex) {
				writeToken(PROPERTY_CODE, propertyIndex)
			}
			property = makeShared(property, activeList, needsCleanup)
			property.parent = this
			sharedProperty[propertyIndex] = property
			property.index = propertyIndex
			activeList.hasUpdates = true
		} else if (property && property.firstUse) {
			// write the reference to the property that was already written in this serialization
			writeToken(PROPERTY_CODE, propertyIndex + 512)
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
	sharedProperty.writeSharedValue = function(value, writeToken, canUpdate) {
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
		if (false && !sharedProperty.isFrozen && canUpdate && length < 32) {
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
	sharedProperty.recordParse = function(item) {
		if (item.resetTo == null) {
			needsCleanup.push(item)
			if (item.nextPosition > -1)
				item.resetTo = item.nextPosition
			else
				item.resetTo = item.length
		}
	}
	sharedProperty.recordUpdate = function() {
		activeList.hasUpdates = true
	}
	sharedProperty.asBlockStructure = function() {
		if (!this.blockStructure) {
			this.blockStructure = createSharedStructure(null, { fromProperty: this })
			this.version = this.blockStructure.version
		}
		return this.blockStructure
	}
	sharedProperty.writingBlock = function(serialize, canUpdate) {
		var blockStructure = this.asBlockStructure()
		try {
			return serialize()
		} finally {
			blockStructure.writeReset()
		}
	}
	sharedProperty.readingBlock = function(parse) {
		var blockStructure = this.asBlockStructure()
		try {
			return parse()
		} finally {
			blockStructure.readReset()
		}
	}
	return sharedProperty
}
exports.serializeSharedBlock = serializeSharedBlock
function serializeSharedBlock(blockBuffer, blockShared, property, canUpdate) {
	var compatibility
	if (property) {
		if (property.blockStructure === blockShared) {
			if (property.recordUpdate && property.version !== blockShared.version) {
				property.version = blockShared.version
				property.recordUpdate()
			}
			return blockBuffer
		}
		compatibility = isCompatibleProperty(property, blockShared)
	} else {
		if (blockShared.length > 0) {
			// no property, (but block is shared) so just write the buffer with its shared part (if there is one)
			blockBuffer = Buffer.concat([Buffer.from('~'), blockShared.serialized, blockBuffer])
		}
		return blockBuffer
	}
	if (compatibility >= 0) {
		// identical or block is a subset compatible
		property.blockStructure = blockShared
		property.version = blockShared.version
	} else {
		if (property.recordUpdate) {
			if (canUpdate && compatibility == -1) {
				// we can update the shared property
				copyProperty(blockShared, property)
				property.blockStructure = blockShared
				property.version = blockShared.version
				property.recordUpdate()
			}
			else {
				// incompatible and we need to restore state after we write
				blockBuffer = Buffer.concat([Buffer.from('~'), blockShared.serialized, blockBuffer,
					Buffer.from('~'), property.serialized])
			}
		} else if (blockShared.length > 0) {
			// not shared, (but block is) so just write and record the new property
			blockBuffer = Buffer.concat([Buffer.from('~'), blockShared.serialized, blockBuffer])
			property.blockStructure = blockShared
			property.version = blockShared.version
		}
	}
	return blockBuffer
}

function copyProperty(source, target) {
	target.code = source.code
	target.instance = source.instance
	for (var i = 0, l = source.length; i < l; i++) {
		target[i] = source[i]
	}
	target.length = source.length
}

// return values:
// 0: identical property structures
// -1: a has less properties, but can be safely upgraded to b and still be compatible with a
// 1: a has more properties, but is compatible and can be used to decode b
// -2: incompatible property structures, can not be used
function isCompatibleProperty(a, b) {
	if (a.blockStructure === b) {
		return a.version > b.version ? 1 : 0
	}
	if (a.code === b.code && a.key === b.key && a.extendedType === b.extendedType) {
		var sharedLength = Math.min(a.length, b.length)
		var compatibility = 0
		for (var i = 0; i < sharedLength; i++) {
			var childCompatibility = isCompatibleProperty(a[i], b[i])
			if (childCompatibility === -2)
				return -2
			if (childCompatibility === -1) {
				if (compatibility === 1)
					return -2
				compatibility = -1
			}
			if (childCompatibility === 1) {
				if (compatibility === -1)
					return -2
				compatibility = 1
			}
		}
		var sharedValuesLength = Math.min(a.values ? a.values.length : 0, b.values ? b.values.length : 0)
		for (var i = 0; i < sharedValuesLength; i++) {
			if (a.values[i] !== b.values[i]) {
				return -2
			}
		}
		if (a.length < b.length) {
			if (compatibility === 1) {
				return -2
			}
			compatibility = -1
		} else if (a.length < b.length) {
			if (compatibility === -1) {
				return -2
			}
			compatibility = 1
		}
		if (a.values.length < b.values.length) {
			if (compatibility === 1) {
				return -2
			}
			compatibility = -1
		} else if (a.values.length < b.values.length) {
			if (compatibility === -1) {
				return -2
			}
			compatibility = 1
		}
		return compatibility
	} else {
		return -2
	}
}