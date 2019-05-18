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

var METADATA_TYPE = 11
var REFERENCING_POSITION = 13
var TYPE_DEFINITION = 14 // ~  // for defining a typed object without returning the value
var UNSTRUCTURED_MARKER = 11

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
	sharedProperty.version = 0
	resetSerializer(sharedProperty)
	var previousAvoidShareUpdate

	sharedProperty.startWrite = function(avoidShareUpdate, value) {
		if (value.constructor === Array) {
			if (sharedProperty.code !== ARRAY_TYPE && sharedProperty.version > 0) {
				throw new Error('Can not change the root type of a shared object to an array')
			}
			sharedProperty.code = ARRAY_TYPE
			sharedProperty.type = 'array'
		}
		if (sharedProperty.writing)
			return
		else
			sharedProperty.writing = true
		previousAvoidShareUpdate = currentAvoidShareUpdate
		if (avoidShareUpdate)
			currentAvoidShareUpdate = true
	}
	sharedProperty.endWrite = function() {
		if (sharedProperty.writing)
			sharedProperty.writing = false
		else
			return
		currentAvoidShareUpdate = previousAvoidShareUpdate
		for (let i = 0; i < activeList.length; i++) {
			let activeSharedProperty = activeList[i]
			let instance = activeSharedProperty.instance
			let previousProperties = activeSharedProperty.previousProperties
			if (previousProperties.length > 12) {
				console.log('Marking property as unstructured', activeSharedProperty.key)
				activeSharedProperty.previousProperties = []
				activeSharedProperty.metadata = UNSTRUCTURED_MARKER
			}
			if (activeSharedProperty.metadata !== UNSTRUCTURED_MARKER) {
				if (!sharedProperty.isFrozen) {
					for (let j = 0; j < previousProperties.length; j++) {
						let property = previousProperties[j]
						property.score = (property.score || 0) - 1
					}
					for (let j = 0; j < instance.length; j++) {
						let property = instance[j]
						if (property.firstUse)
							previousProperties.push(property)
					}
					instance.length = 0
				}
			}
			instance.length = 0
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

	// upgrades the property to output this block
	// return 0 if the property was upgraded, or is compatible,
	// 1 if the shared information needs to be reserialized
	// 2 if the shared information needs to be written out, but the property was upgraded
	sharedProperty.upgrade = function(property, randomAccess) {
		var blockShared = sharedProperty
		if (!property) {
			return 1
		}
		var compatibility
		if (property) {
			// same block was serialized last time, fast path to compatility
			if (property.blockStructure === blockShared) {
				if (property.recordUpdate && property.blockVersion !== blockShared.version &&
						property.blockStructure !== property) {
					// but if the version incremented, we need to update
					property.blockStructure = blockShared
					property.blockVersion = blockShared.version
					copyProperty(blockShared, property)
					property.recordUpdate()
				}
				return 0
			}
			compatibility = isCompatibleProperty(property, blockShared)
		} else {
			if (blockShared.length > 0) {
				// no property, (but block is shared) so just write the buffer with its shared part (if there is one)
				blockBuffer = Buffer.concat([blockShared.serialized, blockBuffer])
			}
			return 1
		}
		if (compatibility >= 0) {
			// identical or block is a subset compatible, update current block for fast path
			property.blockStructure = blockShared
			property.blockVersion = blockShared.version
			return 0
		} else {
			if (!property.recordUpdate || compatibility == -1) {
				copyProperty(blockShared, property)
				property.blockStructure = blockShared
				property.blockVersion = blockShared.version
				if (property.recordUpdate) {
					property.recordUpdate()
					return 0
				} else {
					// we upgraded, but still need to write out the shared serialization
					return 2
				}
			} else {
				throw new Error('Incompatible object set in shared property')
				return 3
			}
		}
		return 1 // incompatible, reserialize
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
		copyProperty(readProperty, sharedProperty)
		sharedProperty.version = 1
	} else if (options && options.fromProperty) {
		copyProperty(options.fromProperty, sharedProperty)
		sharedProperty.version = 1
	}
	sharedProperty.key = null // root must be null (for the parser to work properly)

	function copyProperty(source, target) {
		target.code = source.code
		target.type = source.type || types[source.code]
		for (var i = 0, l = source.length; i < l; i++) {
			var childProperty = source[i]
			var instance = []
			if (typeof childProperty.values === 'object')
				instance.values = childProperty.values
			var targetChild = target[i] = makeShared(instance, activeList, needsCleanup)
			targetChild.key = childProperty.key
			if (childProperty.metadata)
				targetChild.metadata = childProperty.metadata
			if (childProperty.blockStructure) {
				targetChild.blockStructure = childProperty.blockStructure
				targetChild.blockVersion = childProperty.blockVersion
			}
			targetChild.parent = target
			copyProperty(childProperty, targetChild)
		}
		if (target.previousValues) {
			target.values = target.previousValues
			target.previousValues = []
		}
		target.length = source.length
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

var currentAvoidShareUpdate

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
	serializeSharedProperty(sharedProperty, writers, true, true)
	let serialized = serializer.getSerialized()
	console.log('latest serialized', serialized.toString())
	return serialized
}

function serializeSharedProperty(sharedProperty, writers, expectsObjectWithNullKey, isRoot) {
	if (!(expectsObjectWithNullKey && sharedProperty.code === DEFAULT_TYPE)) {
		writers.writeProperty(null, sharedProperty.key, sharedProperty.type || (sharedProperty.type = types[sharedProperty.code]))
	}
	var length = sharedProperty.length
	if (isRoot && length > 0) {
		writers.writeToken(TYPE_CODE, TYPE_DEFINITION)
	}
	if (sharedProperty.blockStructure) {
		// use the block structure if there is one
		sharedProperty = sharedProperty.blockStructure
	}
	if (sharedProperty.metadata) {
		writers.writeToken(TYPE_CODE, METADATA_TYPE)
		writers.writeToken(NUMBER_CODE, sharedProperty.metadata)
	}
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
	sharedProperty.key = thisProperty.key
	sharedProperty.type = thisProperty.type
	sharedProperty.code = thisProperty.code
	sharedProperty.instance = thisProperty
	sharedProperty.previousProperties = thisProperty.slice(0) // copy this to use as the previous properties to start with
	if (typeof thisProperty.values == 'object') {
		sharedProperty.previousValues = thisProperty.values
		thisProperty.values = []
		sharedProperty.values = []
		sharedProperty.lastIndex = 0
	}
	function getBlock() {

	}
	// TODO: Create a class that extends Array with all these methods
	sharedProperty.getProperty = function(value, key, type, extendedType, writeProperty, writeToken, lastPropertyIndex) {
		let property, propertyIndex
		let thisProperty = sharedProperty.instance
		if (!sharedProperty.active) {
			sharedProperty.active = true
			activeList.push(sharedProperty)
		}
		function propertySearch(parentProperty) {
			propertyIndex = -1
			do {
				property = parentProperty[++propertyIndex]
			} while(property && (property.key !== key ||
					(property.type !== type && type !== 'boolean' && type !== 'undefined') ||
					(extendedType && property.extendedType !== constructor)))
		}
		// resume property search through the instance section
		propertySearch(thisProperty)
		if (property) {
			// write the reference to the property that was already written in this serialization
			writeToken(PROPERTY_CODE, propertyIndex + 512)
		} else {
			let previousExists = true
			if (!sharedProperty.isFrozen && !currentAvoidShareUpdate &&
				(typeof key === 'string' || key === null) && sharedProperty.length < 512) {
				// search recently used
				propertySearch(sharedProperty.previousProperties)
				if (property) {
					if (!(property.score < 0)) {
						// found a match, score isn't too low, upgrade to a shared property
						sharedProperty.previousProperties.splice(propertyIndex, 1)
						propertyIndex = sharedProperty.length
						if (lastPropertyIndex !== propertyIndex) {
							writeToken(PROPERTY_CODE, propertyIndex)
						}
						property = makeShared(property, activeList, needsCleanup)
						property.instance.length = 0
						property.parent = this
						sharedProperty[propertyIndex] = property
						property.index = propertyIndex
						activeList.hasUpdates = true
						return property
					} else {
						property.score = property.score + 5
					}
				} else
					previousExists = false
			}
			// return a new instance property
			propertyIndex = thisProperty.length + 512
			if (lastPropertyIndex !== propertyIndex) {
				writeToken(PROPERTY_CODE, propertyIndex)
			}
			property = thisProperty[propertyIndex - 512] = writeProperty(value, key, type, extendedType, propertyIndex)
			property.firstUse = !previousExists
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
		if (false && !sharedProperty.isFrozen && !currentAvoidShareUpdate && length < 32) {
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
			this.blockVersion = this.blockStructure.version
		}
		return this.blockStructure
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

// return values:
// 0: identical property structures
// -1: a has less properties, but can be safely upgraded to b and still be compatible with a
// 1: a has more properties, but is compatible and can be used to decode b
// -2: incompatible property structures, can not be used
function isCompatibleProperty(a, b) {
	if (a.blockStructure === b) {
		return a.version > b.version ? 1 : 0
	}
	if (a.code === b.code && a.extendedType === b.extendedType) {
		var sharedLength = Math.min(a.length, b.length)
		var compatibility = 0
		for (var i = 0; i < sharedLength; i++) {
			if (a[i].key !== b[i].key)
				return -2
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
		/*if (a.values.length < b.values.length) {
			if (compatibility === 1) {
				return -2
			}
			compatibility = -1
		} else if (a.values.length < b.values.length) {
			if (compatibility === -1) {
				return -2
			}
			compatibility = 1
		}*/
		return compatibility
	} else {
		return -2
	}
}