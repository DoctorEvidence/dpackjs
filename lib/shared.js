const createSerializer = require('./serialize').createSerializer
const serialize = require('./serialize').serialize
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
exports.readSharedStructure = readSharedStructure
function readSharedStructure(from) {
	var parser = createParser()
	var sharedProperty = []
	sharedProperty.code = 6
	sharedProperty.key = null
	// end with with NULL (p) value to return something from type definition
	parser.setSource(from + 'p').read([sharedProperty])
	setupShared(sharedProperty)
	sharedProperty.serialized = from
	return sharedProperty
}

function setupShared(property) {
	property.resetTo = property.length
	property.startWrite = startWrite
	property.upgrade = upgrade
	property.type = types[property.code]
	property.isFrozen = true
	Object.defineProperty(property, 'serialized', {
		get() {
			return this._serialized || (this._serialized = serializeSharedStructure(this))
		}
	})

	if (typeof property.values === 'object' && property.values) {
		property.values.resetTo = property.values.length
	}
	for (var i = 0, l = property.length; i < l; i++) {
		setupShared(property[i])
	}
}
function startWrite() {
	for (var i = 0, l = this.length; i < l; i++) {
		startWrite.call(this[i])
	}
	this.length = this.resetTo || 0
	if (typeof this.values === 'object' && this.values) {
		this.values.length = this.values.resetTo || 0
	}
}



		// upgrades the property to output this block
		// return 0 if the property was upgraded, or is compatible,
		// 1 if the shared information needs to be written out, but the property was upgraded
		// 2 if the shared information needs to be reserialized
function upgrade(property) {
	if (!property) {
		return 1
	}
	var compatibility
	if (property) {
		// same block was serialized last time, fast path to compatility
		if (property.insertedFrom === this && property.insertedVersion === this.version && (
				property.recordUpdate || (property.length == 0 && property.code == this.code && property.values == null)
			)) {
			// but if the version incremented, we need to update
			return 0
		}
		var changedCode
		if (this.code !== property.code)
			changedCode = true
		if (property.upgrade) {
			if (this.startWrite && this.isFrozen) // frozen shared object
				this.startWrite()
			if (property.startWrite && property.isFrozen) // frozen shared object
				property.startWrite()
			var compatibility = copyProperty(this, property)
			if (changedCode)
				compatibility = 2
			if (property.isFrozen && compatibility > 0) {
				return compatibility
			}
			property.insertedFrom = this
			property.insertedVersion = this.version
			if (compatibility === 2) {
				debugger
				console.error('Inserting incompatible block into property')
				return 2
			} else 
			return 0
		} else { // upgrading into non-shared property,
			property.insertedFrom = this
			property.insertedVersion = this.version
			// if this is not a shared property that tracks changes, we have reset and ensure that it doesn't change when we reuse it
			property.length = 0
			property.values = null
			if (property.fromValue)
				property.fromValue = null
			return 1
		}
	} else {
		if (this.length > 0) {
			// no property, (but block is shared) so just write the buffer with its shared part (if there is one)
			blockBuffer = Buffer.concat([this.serialized, blockBuffer])
		}
	}
	return 1
}

var typeToCode = {
	string: REFERENCING_TYPE,
	number: NUMBER_TYPE,
	object: DEFAULT_TYPE,
	boolean: DEFAULT_TYPE,
	undefined: DEFAULT_TYPE,
	array: ARRAY_TYPE
}

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
			this.key = typeof instanceProperty.key == 'string' ? isolateString(instanceProperty.key) : instanceProperty.key
			this.type = instanceProperty.type
			this.code = instanceProperty.code
			this.count = 0
			if (this.code == REFERENCING_TYPE) {
				this.values = []
				this.previousValues = new Map()
				this.lastIndex = 0
			}
		}
		newProperty(instance) {
			return new Shared(instance)

		}
		getProperty(value, key, type, extendedType, writeProperty, writeToken, lastPropertyIndex) {
			let property
			if (this.insertedFrom) {
				propertySearch(this.insertedFrom)
				if (property) {
					if (lastPropertyIndex !== property.index) {
						writeToken(PROPERTY_CODE, propertyIndex)
					}
					return property
				}
				if (this.insertedFrom.getProperty) {
					//this.recordUpdate()
					return this.insertedFrom.getProperty(value, key, type, extendedType, writeProperty, writeToken, lastPropertyIndex)
				} else {
					debugger
				}
			}
			this.recordUpdate()
			let propertyIndex = this.length
			if (lastPropertyIndex !== propertyIndex) {
				writeToken(PROPERTY_CODE, propertyIndex)
			}
			property = this[propertyIndex] = new Shared({
				key,
				type,
				code: typeToCode[type]
			})
			property.parent = this
			property.index = propertyIndex
			return property
			function propertySearch(parentProperty) {
				let propertyIndex = -1
				do {
					property = parentProperty[++propertyIndex]
				} while(property && (property.key !== key ||
						(property.type !== type && type !== 'boolean' && type !== 'undefined') ||
						(extendedType && property.extendedType !== constructor)))
			}
			propertyIndex = this.length
			if (lastPropertyIndex !== propertyIndex) {
				writeToken(PROPERTY_CODE, propertyIndex)
			}
			// search recently used
			propertySearch(this.previousProperties)
			if (property) {
				if (property.lastIteration !== activeList.iteration) {
					property.lastIteration = activeList.iteration
					property.count++
				}
				if (property.code === REFERENCING_TYPE)
					property.values = [] // reset this each time it is introduced
				writeProperty(value, key, type, extendedType, propertyIndex)
				// write it, but return the existing one
			} else {
				property = this[propertyIndex] = new Shared(writeProperty(value, key, type, extendedType, propertyIndex))
				this.previousProperties.push(property)
			}
			property.index = propertyIndex
			return property
		}
		writeSharedValue(value, writeToken) {
			// there are several possible states of a property:
			// 1) Non-referencing state (initial state) - We don't reset position indices, and we never reference previous values
			// 2) Shared/repetitive state - We can have shared values (<12 position) and we can reference properties in an instance (>=12 position)
			// 3) Non-repetitive - If repetition is rare, goes to default type
			this.previousValues.set(value, (this.previousValues.get(value) || 0) + 1)
			var index = this.values.length
			if (index < 12)
				this.values[index] = value
		}
		propertyUsed(property, serializer) {
			if (property.lastSerializer !== serializer.id) {
				property.lastSerializer = serializer.id
				property.count++
			}
		}
		recordUpdate() {
			var property = this
			do {
				property.version = (property.version || 0) + 1
				if (property.insertedFrom) {
					// or we could try to upgrade the latest inserted property?
					property.insertedFrom = null
				}
				if (property._serialized)
					property._serialized = null
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
		//active:
		// 0 - not-actively being monitored
		// 1 - being monitored, but an iteration hasn't started for this
		// 2 - being monitored, and an iteration has started
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
			return
			previousAvoidShareUpdate = currentAvoidShareUpdate
			if (avoidShareUpdate)
				currentAvoidShareUpdate = true
		}
		endWrite() {
			if (this.writing)
				this.writing = false
			else
				return

			this.iterations = (this.iterations || 0) + 1
			function updateProperty(parentProperty) {
				parentProperty.count++
				for (var i = parentProperty.resetTo || 0; i < parentProperty.length; i++) {
					var property = parentProperty[i]
					updateProperty(property)
				}
			}
			//updateProperty(this)
			return
			for (let i = 0; i < activeList.length; i++) {
				let activeSharedProperty = activeList[i]
				if (activeSharedProperty.active !== 2 || !isDescendant(activeSharedProperty, this)) {
					continue
				}
				activeSharedProperty.active = 1
				let instance = activeSharedProperty.instance
				let previousProperties = activeSharedProperty.previousProperties
				let score = 0
				if (activeSharedProperty.metadata !== UNSTRUCTURED_MARKER && !activeSharedProperty.isFrozen) {
					for (let j = 0; j < previousProperties.length; j++) {
						let property = previousProperties[j]
						property.score = (property.score || 0) - 1
						score += property.score
						if (property.score < -20) {
							previousProperties.splice(j--, 1)
						} else if (property.values && property.values.length > 0) {
							property.values = [] // don't need to keep holding on to old values
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

				let previousValues = activeSharedProperty.previousValues
				if (previousValues && (instance.values && instance.values.length > 0 || previousValues.size) && !activeSharedProperty.isFrozen) {
					if (!currentAvoidShareUpdate) {
						if (!activeSharedProperty.values &&
							(instance.values.length + previousValues.size) * activeList.iteration >
								((activeSharedProperty.repetitions || 0) + 10) * 15) {
							// move to permanently non-repetitive
				console.log('changing referenceable to default', activeSharedProperty.key)
							activeSharedProperty.previousValues = null
							activeSharedProperty.code = DEFAULT_TYPE
							activeSharedProperty.type = 'object'
							activeSharedProperty.recordUpdate()
							instance.values = false
							previousValues = []
						}
						// TODO: If this is repetitive within each instance, but not between,
						// add a empty string to make this usable as a referencable
						for (let j = 0; j < instance.values.length; j++) {
							let value = instance.values[j]
							let valueEntry = previousValues.get(value)
							if (valueEntry) {
								activeSharedProperty.repetitions = (activeSharedProperty.repetitions || 0) + 1
							} else {
								previousValues.set(value, valueEntry = {
									score: 0
								})
							}
							if ((valueEntry.score += 1) > 20) {
								let values = activeSharedProperty.values
								if (!values) {
									activeSharedProperty.values = values = []
									values.nextPosition = 0
								}
								values[values.nextPosition++] = isolateString(value)
				console.log('adding value', value, 'to', activeSharedProperty.key)
								activeSharedProperty.recordUpdate()
								if (values.length >= 12) {
									activeSharedProperty.previousValues = null // don't tracking previous values, can't fit anymore
									break
								} else {
									previousValues.delete(value)
								}
							}
						}
						for (let [value, entry] of previousValues) {
							entry.score--
							if (entry.score < -20) {
								previousValues.delete(value)
							}
						}
					}
				} else if (instance.length == 0 && previousProperties.length == 0) {
					activeSharedProperty.active = 0
					activeList.splice(i--, 1)
				}
				if (instance.values && instance.values.length > 0) {
					// always clear out any instance values on reset
					instance.values = []
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
			currentAvoidShareUpdate = previousAvoidShareUpdate
		}

		upgrade(property) {
			return upgrade.call(this, property)
		}

		get serialized() {
			return this._serialized || (this._serialized = serializeSharedStructure(this))
		}
		serializeCommonStructure = function() {
			var usageThreshold = Math.sqrt(this.iterations)
			return serializeSharedStructure(this, childProperty => childProperty.count > usageThreshold || childProperty.insertedFrom)
		}
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

function isDescendant(property, possibleParent) {
	do {
		if (property === possibleParent)
			return true
	} while (property = property.parent)
}
// default type for each code
var types = {
	6/*DEFAULT_TYPE*/: 'object',
	7/*ARRAY_TYPE*/: 'array',
	8/*REFERENCING_TYPE*/: 'string',
	9/*NUMBER_TYPE*/: 'number'
}

var currentAvoidShareUpdate
function serializeSharedStructure(property, condition) {
	var serializer = createSerializer()
	var writers = serializer.getWriters()
	serializeSharedProperty(property, true, true, condition)
	function serializeSharedProperty(property, expectsObjectWithNullKey, isRoot, condition) {
		if (property.insertedFrom) {
			property = property.insertedFrom
			var usageThreshold = Math.sqrt(property.iterations)
			if (condition)
				condition = (childProperty => childProperty.count >= usageThreshold || childProperty.insertedFrom)
		}
		if (!(expectsObjectWithNullKey && property.code === DEFAULT_TYPE)) {
			writers.writeProperty(null, property.key, types[property.code])
		}
		var isArray = property.code === ARRAY_TYPE
		var commonProperties = condition ? property.filter(condition) : property
		var length = commonProperties.length
		if (isRoot && length > 0) {
			writers.writeToken(TYPE_CODE, TYPE_DEFINITION)
		}
		if (length > 0) {
			// we always use open sequence, because writing multiple values of a property use extra property counts,
			// plus it is easier to deal with properties without values
			writers.writeToken(SEQUENCE_CODE, OPEN_SEQUENCE)
			for (var i = 0; i < length; i++) {
				var childProperty = commonProperties[i]
				childProperty.index = i
				if (isArray && i > 0) {
					writers.writeToken(PROPERTY_CODE, i)
				}
				serializeSharedProperty(childProperty, commonProperties.code === ARRAY_TYPE && i === 0, false, condition)
			}
			writers.writeToken(SEQUENCE_CODE, END_SEQUENCE)
		}
		var first = true
		if (property.previousValues) {
			for (let [value, count] of property.previousValues) {
				if (count >= usageThreshold * 2) {
					if (first)
						first = false
					else // reset property code for each subsequent value so we don't move on to the next property in parsing
						writers.writeToken(PROPERTY_CODE, property.index)
					writers.writeAsDefault(value)
				}
			}
		} else if (property.values && property.values.resetTo > 0) {
			for (var i = 0, l = property.values.resetTo; i < l; i++) {
				var value = property.values[i]
				if (first)
					first = false
				else // reset property code for each subsequent value so we don't move on to the next property in parsing
					writers.writeToken(PROPERTY_CODE, property.index)
				writers.writeAsDefault(value)
			}
		}

	}
	let serialized = serializer.getSerialized()
	return serialized
}
function copyProperty(source, target, freezeTarget, startingIndex) {
	var compatibility = source.length > target.length ? 1 : 0
	target.code = source.code
	target.type = source.type || types[source.code]
	if (freezeTarget) {
		target.isFrozen = true
		if (target.previousValues)
			target.previousValues = null
	}
	for (var i = startingIndex || 0, l = source.length; i < l; i++) {
		var targetChild = target[i]
		var childProperty = source[i]
		if (targetChild && (targetChild.key != childProperty.key || targetChild.extendedType != childProperty.extendedType ||
			targetChild.code != childProperty.code &&
				!(targetChild.code == 8 && childProperty.code === 6 && (!targetChild.values || !targetChild.values.length)))) { // ok to upgrade from string to default
			if (target.isFrozen)
				return 2
			compatibility = 2
		}
		if (!targetChild) {
			if (target.isFrozen)
				return 1
			var targetChild = []
			targetChild.code = childProperty.code
			if (target.newProperty) {
				targetChild = target.newProperty(targetChild)
			}
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

// TODO: Check to make sure the values are compatible
		if (childProperty.values && childProperty.values.length > 0 && (!targetChild.values || childProperty.values.length > targetChild.values.length)) {
			targetChild.values = childProperty.values.slice(0)
			targetChild.values.nextPosition = childProperty.values.length
			if (targetChild.values.length >= 12) {
				targetChild.previousValues = null
			}
			if (compatibility == 0) {
				compatibility = 1
			}
		}
		var childCompatibility = copyProperty(childProperty, targetChild, freezeTarget)
		if (childCompatibility > compatibility)
			compatibility = childCompatibility
	}
	if (target.recordUpdate && target.length > source.length) {
		// reverse freeze if the target has more values, we don't want the source becoming incompatible
		source.metadata = UNSTRUCTURED_MARKER
		source.recordUpdate()
		// merge back to the source if there are extra properties on the target
		//copyProperty(target, source, i)
		//source.recordUpdate()
	}
	/*if (target.previousValues) {
		target.values = target.previousValues
		target.previousValues = []
	}*/
	//target.length = source.length
	return compatibility
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

function isolateString(string) {
	// this is a technique to forcefully recreate a string so it isn't a slice of a larger string. Because shared
	// structures are long-lived and created from instance structures that are short-lived, the long-lived small
	// sliced strings can end up pinning (otherwise short-lived) large strings in memory.
	return string.slice(0, 1) + string.slice(1)
}