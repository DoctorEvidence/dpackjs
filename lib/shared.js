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
	activeList.iteration = 0
	var previousAvoidShareUpdate

// property id ranges:
// shared: 0 - 511
// instance: 512+
// shared: 

	class Shared extends Array {
		constructor(instanceProperty) {
			super()
			let hasUpdates
			this.key = instanceProperty.key
			this.type = instanceProperty.type
			this.code = instanceProperty.code
			this.instance = instanceProperty
			this.previousProperties = instanceProperty.slice(0) // copy this to use as the previous properties to start with
			if (typeof instanceProperty.values == 'object') {
				this.previousValues = instanceProperty.values
				instanceProperty.values = []
				this.values = []
				this.lastIndex = 0
			}
			this.values = {indexOf() { return -1 }, length: -100}
		}
		newProperty(instance) {
			return new Shared(instance)

		}
		getProperty(value, key, type, extendedType, writeProperty, writeToken, lastPropertyIndex) {
			let property, propertyIndex
			let instanceProperty = this.instance
			if (!this.active) {
				this.active = true
				activeList.push(this)
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
			propertySearch(instanceProperty)
			if (property) {
				// write the reference to the property that was already written in this serialization
				writeToken(PROPERTY_CODE, propertyIndex + 512)
			} else {
				let previousExists = true
				if (!this.isFrozen && !currentAvoidShareUpdate &&
					(typeof key === 'string' || key === null) && this.length < 512 && type != 'unshared') {
					// search recently used
					propertySearch(this.previousProperties)
					if (property) {
						if (property.lastIteration !== activeList.iteration) {
							property.lastIteration = activeList.iteration
							property.score = (property.score || 0) + 5
						}
						if (property.score > 8) {
							// found a match, score isn't too low, upgrade to a shared property
							this.previousProperties.splice(propertyIndex, 1)
							propertyIndex = this.length
							if (lastPropertyIndex !== propertyIndex) {
								writeToken(PROPERTY_CODE, propertyIndex)
							}
							property = new Shared(property)
							if (property.values && property.values.length > 0)
								debugger
							property.instance.length = 0
							property.parent = this
							this[propertyIndex] = property
							property.index = propertyIndex
							this.recordUpdate()
							return property
						}
					} else
						previousExists = false
				}
				// return a new instance property
				propertyIndex = instanceProperty.length + 512
				if (lastPropertyIndex !== propertyIndex) {
					writeToken(PROPERTY_CODE, propertyIndex)
				}
				property = instanceProperty[propertyIndex - 512] = writeProperty(value, key, type, extendedType, propertyIndex)
				property.firstUse = !previousExists
				property.index = propertyIndex
			}
			return property
		}
		writeSharedValue(value, writeToken) {
			let sharedValues = this.values
			let instanceValues = this.instance.values
			let reference = instanceValues.indexOf(value)
			if (reference > -1) {
				writeToken(NUMBER_CODE, reference + 512)
				return true
			}
			if (!this.active) {
				this.active = true
				activeList.push(this)
			}
			let lastIndex = this.lastIndex
			let length = sharedValues.length
			if (false && !this.isFrozen && !currentAvoidShareUpdate && length < 32) {
				reference = this.previousValues.indexOf(value)
				if (reference > -1) {
					// add to shared values
					this.recordUpdate()
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
		recordParse(item) {
			if (item.resetTo == null) {
				needsCleanup.push(item)
				if (item.nextPosition > -1)
					item.resetTo = item.nextPosition
				else
					item.resetTo = item.length
			}
		}
		recordUpdate() {
			activeList.hasUpdates = true
			var property = this
			do {
				property.version = (property.version || 0) + 1
				if (property.insertedFrom) {
					// or we could try to upgrade the latest inserted property?
					property.insertedFrom = null
				}
			} while(property = property.parent)
		}

		readingBlock(parse) {
			//var blockStructure = this.asBlockStructure()
			try {
				return parse()
			} finally {
				this.readReset()
				if (this.length > 500) {
					debugger
				}
			}
		}
		startWrite(avoidShareUpdate, value) {
			activeList.iteration++
			if (value && value.constructor === Array) {
				if (this.code !== ARRAY_TYPE && this.version > 0) {
					throw new Error('Can not change the root type of a shared object to an array')
				}
				if (this.code != ARRAY_TYPE)
					this.recordUpdate()
				this.code = ARRAY_TYPE
				this.type = 'array'
			}
			if (this.writing)
				return
			else
				this.writing = true
			previousAvoidShareUpdate = currentAvoidShareUpdate
			if (avoidShareUpdate)
				currentAvoidShareUpdate = true
		}
		endWrite() {
			if (this.writing)
				this.writing = false
			else
				return
			currentAvoidShareUpdate = previousAvoidShareUpdate
			for (let i = 0; i < activeList.length; i++) {
				let activeSharedProperty = activeList[i]
				let instance = activeSharedProperty.instance
				let previousProperties = activeSharedProperty.previousProperties
				let score = 0
				if (activeSharedProperty.metadata !== UNSTRUCTURED_MARKER && !this.isFrozen) {
					for (let j = 0; j < previousProperties.length; j++) {
						let property = previousProperties[j]
						property.score = (property.score || 0) - 1
						score += property.score
						if (property.score < -20) {
							previousProperties.splice(j--, 1)
						}
					}
					for (let j = 0; j < instance.length; j++) {
						let property = instance[j]
						if (property.firstUse)
							previousProperties.push(property)
					}
				}
				if (score < -100) {
					console.log('Marking property as unstructured', activeSharedProperty.key)
					activeSharedProperty.previousProperties = []
					activeSharedProperty.metadata = UNSTRUCTURED_MARKER
				}
				instance.length = 0
				if (activeSharedProperty.lastIndex) {
					activeSharedProperty.lastIndex = 0
				}
				if (instance.values && instance.values.length > 0) {
					if (!this.isFrozen)
						activeSharedProperty.previousValues = instance.values
					instance.values = []
				} else if (instance.length == 0 && previousProperties.length == 0) {
					activeSharedProperty.active = false
					activeList.splice(i--, 1)
				}
			}
			if (activeList.hasUpdates) {
				activeList.hasUpdates = false
				this.version++
				if (!this._serialized)
					this._serialized = null
				if (options && options.onUpdate)
					options.onUpdate()
			}
		}

		readReset() {
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
		// 1 if the shared information needs to be written out, but the property was upgraded
		// 2 if the shared information needs to be reserialized
		upgrade(property, randomAccess) {
			if (!property) {
				return 1
			}
			var compatibility
			if (property) {
				// same block was serialized last time, fast path to compatility
				if (property.insertedFrom === this && property.insertedVersion === this.version &&
							property.insertedFrom !== property) {
						// but if the version incremented, we need to update
					return 0
				}
				var changedCode
				if (this.code !== property.code)
					changedCode = true
				var compatibility = copyProperty(this, property)
				if (changedCode)
					compatibility = 2
				property.insertedFrom = this
				property.insertedVersion = this.version
				if (compatibility === 2)
					return 2
				if (compatibility === 1) {
					if (property.recordUpdate) {
						property.recordUpdate()
						return 0
					} else {
						// we upgraded, but still need to write out the shared serialization
						return 1
					}
				}
				return 0
			} else {
				if (this.length > 0) {
					// no property, (but block is shared) so just write the buffer with its shared part (if there is one)
					blockBuffer = Buffer.concat([this.serialized, blockBuffer])
				}
			}
			return 1
		}
		get serialized() {
			return this._serialized || (this._serialized = serializeSharedStructure(this))
		}
	}
	function copyProperty(source, target, startingIndex) {
		var compatibility = source.length > target.length ? 1 : 0
		target.code = source.code
		target.type = source.type || types[source.code]
		for (var i = startingIndex || 0, l = source.length; i < l; i++) {
			var targetChild = target[i]
			var childProperty = source[i]
			if (targetChild && (targetChild.code != childProperty.code || targetChild.key != childProperty.key || targetChild.extendedType != childProperty.extendedType)) {
				compatibility = 2
			}
			if (!targetChild) {
				var targetChild = []
				if (typeof childProperty.values === 'object')
					targetChild.values = childProperty.values
				if (target.newProperty)
					targetChild = target.newProperty(targetChild)
				target[i] = targetChild
				if (childProperty.metadata)
					targetChild.metadata = childProperty.metadata
				if (childProperty.insertedFrom) {
					targetChild.insertedFrom = childProperty.insertedFrom
					targetChild.insertedVersion = childProperty.insertedVersion
				}
				targetChild.parent = target
			}
			targetChild.key = childProperty.key
			var childCompatibility = copyProperty(childProperty, targetChild)
			if (childCompatibility > compatibility)
				compatibility = childCompatibility
		}
		if (target.length > source.length) {
			// merge back to the source if there are extra properties on the target
			copyProperty(target, source, i)
			source.recordUpdate()
		}
		/*if (target.previousValues) {
			target.values = target.previousValues
			target.previousValues = []
		}*/
		target.length = source.length
		return compatibility
	}

	var sharedStructure = new Shared(instanceProperty)
	sharedStructure.version = 0

	sharedStructure.freeze = function() {
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
		readProperty.key = null
		// end with with NULL (p) value to return something from type definition
		parser.setSource(from + 'p').read([readProperty])
		copyProperty(readProperty, sharedStructure)
		activeList.hasUpdates = false
		sharedStructure.version = 1
	}
	sharedStructure.key = null // root must be null (for the parser to work properly)

	return sharedStructure
}
// default type for each code
var types = {
	6/*DEFAULT_TYPE*/: 'object',
	7/*ARRAY_TYPE*/: 'array',
	8/*REFERENCING_TYPE*/: 'string',
	9/*NUMBER_TYPE*/: 'number'
}

var currentAvoidShareUpdate

function serializeSharedStructure(sharedProperty) {
	var serializer = createSerializer()
	var writers = serializer.getWriters()
	serializeSharedProperty(sharedProperty, writers, true, true)
	let serialized = serializer.getSerialized()
	return serialized
}

function serializeSharedProperty(sharedProperty, writers, expectsObjectWithNullKey, isRoot) {
	if (!(expectsObjectWithNullKey && sharedProperty.code === DEFAULT_TYPE)) {
		writers.writeProperty(null, sharedProperty.key, sharedProperty.type || (sharedProperty.type = types[sharedProperty.code]))
	}
	var isArray = sharedProperty.code === ARRAY_TYPE
	var length = sharedProperty.length
	if (isRoot && length > 0) {
		writers.writeToken(TYPE_CODE, TYPE_DEFINITION)
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
			if (isArray && i > 0) {
				writers.writeToken(PROPERTY_CODE, i)
			}
			serializeSharedProperty(sharedProperty[i], writers, sharedProperty.code === ARRAY_TYPE && i === 0)
		}
		writers.writeToken(SEQUENCE_CODE, END_SEQUENCE)
	} else if (sharedProperty.values && sharedProperty.values.length > 0) {
		debugger
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