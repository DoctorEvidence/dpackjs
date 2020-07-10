"use strict"
const BLOCK_TYPE = 5
var makeSymbol = typeof Symbol !== 'undefined' ? Symbol : function(name) {
	return 'symbol-' + name
}

/*
Two types of blocks, frozen and copy-on-write
Frozen - originating from JS objects
	Object.freeze() js objects and use symbol for serialized representation
Frozen - originating from dpack, lazy evaluation
	Proxy - get,has,etc. triggers parse, set throws
Copy-on-write from JS objects
	Proxy - get,has,etc. retrieves from source JS object, set copies
Copy-on-write originating from dpack
	Same
*/

var nextVersion = 1
var bufferSymbol = makeSymbol('buffer')
var sizeTableSymbol = makeSymbol('sizeTable')
var headerSymbol = makeSymbol('header')
var parsedSymbol = makeSymbol('parsed')
var sharedSymbol = makeSymbol('shared')
var targetSymbol = makeSymbol('target')
const freezeObjects = process.env.NODE_ENV != 'production'

var DEFAULT_TYPE = 6
var ARRAY_TYPE = 7

/*
size table size types in first 2 bits:

first byte
0 - leaf mode, 6 bit length
1 - leaf mode, 14 bit length
2 - branch/leaf mode, 14, 16, 16 bit our-size length
3 - branch/leaf mode, 30, 48, 48 bit our-size length
*/
function Block() {}
var serializeModule = require('./serialize')

exports.Block = Block
exports.bufferSymbol = serializeModule.bufferSymbol = bufferSymbol
exports.parsedSymbol = parsedSymbol
exports.sharedSymbol = sharedSymbol
exports.targetSymbol = serializeModule.targetSymbol = targetSymbol
exports.sizeTableSymbol = serializeModule.sizeTableSymbol = sizeTableSymbol
var serialize = serializeModule.serialize
var createSerializer = serializeModule.createSerializer
exports.asBlock = asBlock
function asBlock(object, shared) {
	if (object && object[targetSymbol]) {
		return object // already a block
	}
	if (Array.isArray(object)) {
		// if the object is an array, make the taget an array so it passes Array.isArray checks
		let target = []
		target.parsed = object
		target.shared = shared
		return new Proxy(target, onDemandHandler)
	}
	return new Proxy({
		parsed: object,
		shared: shared
	}, onDemandHandler)
}
exports.isBlock = isBlock
function isBlock(object) {
	return object && object[targetSymbol]
}

exports.makeBlockFromBuffer = makeBlockFromBuffer
function makeBlockFromBuffer(dpackString, shared) {
	var sizeTable
	if (dpackString[0] == '\x7f') {
		var parser = createParser().setSource(dpackString.slice(1))
		sizeTable = parser.read()
		dpackString = parser.remainingData()
	}

	var target = {
		dpackString: dpackString,
		sizeTable: sizeTable,
		shared: shared,
		reassign: function(buffer) { // TODO: don't create each time
			this.buffer = buffer
		}
	}
	return new Proxy(target, onDemandHandler)
}

exports.getLazyHeader = function(block) {
	return block[sizeTableSymbol]
}

var onDemandHandler = {
	get: function(target, key) {
		if (specialGetters.hasOwnProperty(key)) {
			return specialGetters[key].call(target)
		}
		var parsed = target.parsed
		if (!parsed) {
			parsed = getParsed(target)
		}
		return parsed[key]
	},
	set: function(target, key, value) {
		// we allow symbols to set as a form of metadata objects even though the main string keyed properties are frozen
		if (typeof key === 'symbol') {
			target[key] = value
			makeSymbolGetter(key)
			return true
		}
		throw new Error('No changes are allowed on frozen parsed object, Use dpack copy() function to modify')
	},
	deleteProperty: function() {
		throw new Error('No changes are allowed on frozen parsed object, Use dpack copy() function to modify')
	},
	getOwnPropertyDescriptor: function(target, key) {
		var parsed = getParsed(target)
		return Object.getOwnPropertyDescriptor(parsed, key)
	},
	has: function(target, key) {
		var parsed = getParsed(target)
		return key in parsed
	},
	ownKeys: function(target) {
		var parsed = getParsed(target)
		var keys = Object.keys(parsed)
		if (Array.isArray(parsed)) {
			keys.push('length')
		}
		return keys
	},
	getPrototypeOf: function(target) {
		var parsed = getParsed(target)
		return Object.getPrototypeOf(parsed)
	}
}

var copyOnWriteHandler = {
	get: function(target, key) {
		if (specialGetters.hasOwnProperty(key)) {
			return specialGetters[key].call(target)
		}
		var cachedParsed = target.cachedParsed
		if (cachedParsed && cachedParsed.hasOwnProperty(key) && !(key == 'length' && Array.isArray(cachedParsed))) {
			return cachedParsed[key]
		}
		var parsed = target.parsed
		if (!parsed) {
			parsed = getParsed(target)
		}
		var value = parsed[key]
		/*if (value && typeof value == 'object') {
			if (!cachedParsed) {
				target.cachedParsed = cachedParsed = parsed instanceof Array ? [] : {}
			}
			if (value instanceof Map)
				cachedParsed[key] = value
			else
				cachedParsed[key] = value = copyWithParent(value, target)
		}*/
		if (value && value[targetSymbol]) {
			if (!cachedParsed) {
				target.cachedParsed = cachedParsed = parsed instanceof Array ? [] : {}
			}
			cachedParsed[key] = value = copyWithParent(value, target)
		}
		return value
	},
	changed: function(target) {
		target.dpackString = null
		target.sizeTable = null
		target.shared = null
		var parsed = target.parsed
		if (!parsed) {
			parsed = getParsed(target)
		}
		if (!target.copied) {
			var cachedParsed = target.cachedParsed
			var copied = target.parsed = target.cachedParsed = parsed instanceof Array ? [] : {}
			for (var key in parsed) {
				var value = cachedParsed && cachedParsed[key]
				if (!value) {
					value = parsed[key]
					if (value && value[targetSymbol]) {
						value = copyWithParent(value, target)
					}
				}
				copied[key] = value
			}
			parsed = copied
			target.copied = true
		}
		target.version = nextVersion++
		return parsed
	},
	checkVersion: function(target) {
		var cachedParsed = target.cachedParsed
		let version = target.version || 0
		if (cachedParsed) {
			for (let key in cachedParsed) {
				var value = cachedParsed[key]
				if (value && value[targetSymbol]) {
					version = Math.max(version, this.checkVersion(value[targetSymbol]))
				}
			}
		}
		if (version != (target.version || 0)) {
			this.changed(target)
			target.version = version
		}
		return version
	},
	set: function(target, key, value, proxy) {
		if (specialSetters.hasOwnProperty(key)) {
			specialSetters[key].call(target, value)
			return true
		}
		var parsed = copyOnWriteHandler.changed(target)
		parsed[key] = value
		return true
	},
	deleteProperty: function(target, key) {
		var parsed = copyOnWriteHandler.changed(target)
		return delete parsed[key]
	},
	getOwnPropertyDescriptor: function(target, key) {
		var parsed = getParsed(target)
		return Object.getOwnPropertyDescriptor(parsed, key)
	},
	has: function(target, key) {
		var parsed = getParsed(target)
		return key in parsed
	},
	ownKeys: function(target) {
		var parsed = getParsed(target)
		var keys = Object.keys(parsed)
		if (Array.isArray(parsed)) {
			keys.push('length')
		}
		if (target.copied) {
			for (var key in target.copied) {
				if (keys.indexOf(key) === -1) {
					keys.push(key)
				}
			}
		}
		return keys
	},
	getPrototypeOf: function(target) {
		var parsed = getParsed(target)
		return Object.getPrototypeOf(parsed)
	}
}

var specialGetters = {
}
specialGetters[bufferSymbol] = function() {
	return function(property, randomAccess) {
		var propertyIsShared = property && property.upgrade
		var buffer

		if (this.cachedParsed && this.dpackString) {
			copyOnWriteHandler.checkVersion(this)
		}
		if (!(this.shared && this.shared.upgrade) && propertyIsShared) {
			if (this.dpackString) {
				// if the block has been serialized without a shared structure, and it will be used in a shared structure,
				// we put it in a separate property
				this.sizeTable = null
				return inSeparateProperty(this.dpackString, true)
			} else {
				return getSerialized(this, this.shared = property)
			}
		}
		if (!this.dpackString) {
			getSerialized(this, this.shared)
		}
		if (this.shared && this.shared.upgrade && this.shared !== property) {
			var compatibility = this.shared.upgrade(property, randomAccess)
			if (compatibility > 0) {
				// if the property upgrade was incompatible, we have to included the shared structure, and force sequential reading
				this.sizeTable = null
				var sharedBuffer = this.shared.serialized
				if (sharedBuffer.length > 0) {
					if (compatibility == 2 && !(property.isFrozen && property.resetTo === 0))
						sharedBuffer = inSeparateProperty(sharedBuffer)
					buffer = sharedBuffer + this.dpackString
					buffer.mustSequence = true
					return buffer
				}
			}
		} else if (property) {
			if (!propertyIsShared) {
				// need to reset this property, if it is a plain sequential property
				property.length = 0
			}
			if (property.insertedFrom)
				property.insertedFrom = null
		}
		return this.dpackString

		function inSeparateProperty(dpackString) {
			var serializer = createSerializer()
			var isArray = dpackString[0] === 119
			var writeToken = serializer.getWriters().writeToken
			if (isArray) {
				dpackString = dpackString.slice(1) // replacing the property declaration
			}
			writeToken(0, 1000)// use a hopefully unused slot (should be unused, block always has a single initial starting slot)
			writeToken(3, isArray ? ARRAY_TYPE : DEFAULT_TYPE) // property type
			if (property && property.key !== null)
				serializer.serialize(property.key)
			dpackString = serializer.getSerialized() + dpackString
			dpackString.mustSequence = true
			return dpackString
		}

	}.bind(this)
}
specialGetters[targetSymbol] = function() {
	return this
}
specialGetters[sharedSymbol] = function() {
	return this.shared
}
specialGetters[parsedSymbol] = function() {
	return this.parsed || getParsed(this)
}
specialGetters[sizeTableSymbol] = function() {
	if (!this.dpackString) {
		getSerialized(this)
	}
	return this.sizeTable
}
specialGetters.then = function() {
	// return undefined, this is not a promise
}
specialGetters.toJSON = function() {
	return valueOf
}

specialGetters.valueOf = function() {
	return valueOf
}
specialGetters.entries = function() {
	return entries
}
function entries() {
	return this[parsedSymbol].entries()
}
specialGetters[Symbol.iterator] = function() {
	var parsed = this.parsed || getParsed(this)
	return parsed && parsed[Symbol.iterator] && iterator
}
function iterator() {
	var parsed = this[parsedSymbol]
	return parsed && parsed[Symbol.iterator] ? parsed[Symbol.iterator]() : [][Symbol.iterator]()
}
specialGetters.constructor = function() {
	if (this.parsed) {
		return this.parsed.constructor
	}
	// this is a fast path for getting the constructor without having to parse. this is important
	// as it enables blocks to be go through the serializer, have it check the constructor, without
	// requiring parsing, and then they can be directly written from their binary buffer
	if (this.dpackString) {
		let firstByte = this.dpackString[0]
		if (firstByte >= 48 && firstByte <= 60) {
			// sequence
			if (this.shared) {
				if (this.shared.code == DEFAULT_TYPE) {
					return Object
				} else if (this.shared.code == ARRAY_TYPE) {
					return Array
				}
			} else {
				return Object
			}
		} else if (firstByte === 119) {
			return Array
		}
	}
	return getParsed(this).constructor
}


function makeSymbolGetter(symbol) {
	if (!specialGetters[symbol])
		specialGetters[symbol] = function() {
			return this[symbol]
		}
}
function valueOf() {
	return this[parsedSymbol]
}
function copy(source) {
	return copyWithParent(source)
}
function copyWithParent(source, parent) {
	if (!isBlock(source)) {
		/*if (source && typeof source == 'object')
			source = asBlock(source)
		else*/
			return source
	}
	let isArray = Array.isArray(source)
	let target = isArray ? [] : {}
	Object.defineProperties(target, {
		parsed: {
			get() {
				return source[parsedSymbol]
			},
			set(value) {
				Object.defineProperty(this, 'parsed', {
					value: value,
					writable: true,
					enumerable: true
				})
			},
			configurable: true,
		},
		shared: {
			get() {
				return source[sharedSymbol]
			},
			set(value) {
				Object.defineProperty(this, 'shared', {
					value: value,
					writable: true,
					enumerable: true
				})
				this.dpackString = null
				this.sizeTable = null
			},
			configurable: true,
		},
		dpackString: {
			get() {
				return source[targetSymbol].dpackString
			},
			set(value) {
				Object.defineProperty(this, 'dpackString', {
					value: value,
					writable: true,
					enumerable: true
				})
			},
			configurable: true,
		},
		sizeTable: {
			get() {
				return source[sizeTableSymbol]
			},
			set(value) {
				Object.defineProperty(this, 'sizeTable', {
					value: value,
					writable: true,
					enumerable: true
				})
			},
			configurable: true,
		}
	})
	if (isArray) {
		Object.define
	}
	return new Proxy(target, copyOnWriteHandler)
}
exports.copy = copy

var specialSetters = {
}
/*specialSetters[sharedSymbol] = function(shared) {
	return this.shared = shared
}*/

function getParsed(target) {
	var parsed = target.parsed
	if (parsed)
		return parsed
	// we check to see if there are multiple blocks that should be deferred into separate blocks
	var sizeTable = target.sizeTable
	var dpackString = target.dpackString
	if (!sizeTable) {
		// no child blocks, just dpack, so directly parse
		return target.parsed = parse(dpackString, {
			freezeObjects: freezeObjects,
			shared: target.shared
		})
	}
	var childSizeTables = []
	var childDpackBlocks = []
	var dpackChildOffset = sizeTable.shift()
	for (var i = 0; i < sizeTable.length; i++) {
		var size = getSize(sizeTable[i])
		childDpackBlocks.push(dpackString.slice(dpackChildOffset, dpackChildOffset += size))
	}
	function getSize(entry) {
		if (typeof entry == 'number')
			return entry
		return entry.reduce(function(a, b) { return a + getSize(b) }, 0)
	}

	let blockIndex = 0
	var parser = createParser(childDpackBlocks.length > 0 ? { // if no child blocks, use normal deferred parsing
		shared: target.shared,
		forDeferred: function(value, property) {
			let target = new value.constructor
			target.dpackString = childDpackBlocks[blockIndex]
			target.sizeTable = childSizeTables[blockIndex++]
			target.shared = property ?
					property.upgrade ?
						property :
						{ code: property.code, key: null, type: property.type } :
					null
			return new Proxy(target, onDemandHandler)
		},
		freezeObjects: freezeObjects
	} : {
		shared: target.shared
	}).setSource(target.dpackString)
	return target.parsed = target.shared ? parser.read([target.shared]) : parser.read()
}

function getSerialized(target, shareProperty) {
	var childBlocks = []
	var childSizeTables = []
	var childDpackSizes = 0
	var mustSequence // mustSequence is an indication that the blocks must be read in sequence and can't be randomly accessed
	var serializerOptions = {
		forBlock: function(block, property) {
			var dpackString = block[bufferSymbol](property, true)
			if (dpackString.mustSequence) {
				mustSequence = true
				childBlocks.push(dpackString)
				return dpackString
			}
			var sizeTable = block[sizeTableSymbol]
			if (!sizeTable) {
				sizeTable = dpackString.length
			}
			childSizeTables.push(sizeTable)
			childBlocks.push(dpackString)
			return dpackString
		},
		shared: shareProperty,
		freezeObjects: freezeObjects
	}
	var rootBlock = serialize(target.parsed, serializerOptions)
	if (childBlocks.length == 0) {
		// no child blocks, just use the root block
		return target.dpackString = rootBlock
	}
	childBlocks.unshift(rootBlock)
	// TODO: Do word aligment with any buffer copying, to make sure CPU can copy words instead of bytes
	var dpackString = target.dpackString = childBlocks.join('')
	if (mustSequence) {
		return dpackString
	}

	childSizeTables.unshift(rootBlock.length)
	target.sizeTable = childSizeTables
	return dpackString
}

function deepCopy(source) {
	let target = new source.constructor()
	for (let key in source) {
		let value = source[key]
		if (value && typeof value == 'object')
			value = deepCopy(value)
		target[key] = value
	}
	return target
}
var parse = require('./parse').parse
var createParser = require('./parse').createParser
var serializeSharedBlock = require('./shared').serializeSharedBlock

exports.parseLazy = function(dpackString, options) {
	if (dpackString[0] == '\x7f') {
		return makeBlockFromBuffer(dpackString, options && options.shared)
	} else {
		return parse(dpackString, options)
	}
}
