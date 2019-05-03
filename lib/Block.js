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


var bufferSymbol = makeSymbol('buffer')
var sizeTableSymbol = makeSymbol('sizeTable')
var headerSymbol = makeSymbol('header')
var parsedSymbol = makeSymbol('parsed')
var sharedSymbol = makeSymbol('shared')
var targetSymbol = makeSymbol('target')


/*
size table size types in first 2 bits:

first byte
0 - leaf mode, 6 bit length
1 - leaf mode, 14 bit length
2 - branch/leaf mode, 14, 16, 16 bit our-size length
3 - branch/leaf mode, 30, 48, 48 bit our-size length
*/
function Block() {}
exports.Block = Block
exports.bufferSymbol = bufferSymbol
exports.parsedSymbol = parsedSymbol
exports.sharedSymbol = sharedSymbol
exports.targetSymbol = isBlock.targetSymbol = targetSymbol
exports.sizeTableSymbol = sizeTableSymbol
var serialize = require('./serialize').serialize
var createBinaryParser = require('./binary-parse').createParser
exports.asBlock = function(object, shared) {
	if (object && object[targetSymbol]) {
		return object // already a block
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

exports.makeBlockFromBuffer = function(buffer, imports) {
	var dpackBuffer, sizeTableBuffer
	if (buffer[0] < 0x80) {
		dpackBuffer = buffer
	} else { // a branch type will always be greater than 0x80
		var type = buffer[0] >> 6
		var dpackOffset
		if (type === 2) {
			dpackOffset = buffer.readUInt16BE(0) & 0x3fff
		} else {
			dpackOffset = buffer.readUInt32BE(0) & 0x3fffffff
		}
		dpackBuffer = buffer.slice(dpackOffset)
		sizeTableBuffer = buffer.slice(0, dpackOffset)
	}

	var target = {
		dpackBuffer: dpackBuffer,
		sizeTableBuffer: sizeTableBuffer,
		imports: imports,
		reassign: function(buffer) { // TODO: don't create each time
			this.buffer = buffer
		}
	}
	buffer.owner = target
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
		throw new Error('No changes are allowed on frozen parsed object, Use Block.copy to modify')
	},
	deleteProperty: function() {
		throw new Error('No changes are allowed on frozen parsed object, Use Block.copy to modify')
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
		return Object.keys(parsed)
	},
	getPrototypeOf: function(target) {
		var parsed = getParsed(target)
		return Object.getPrototypeOf(parsed)
	}
}

exports.reassignBuffers = reassignBuffers
function reassignBuffers(block, newParentNodeBuffer, parentArrayBuffer) {
		// if a buffer needs to be moved to a new buffer due to it soon being no longer referenceable, we can reference the new copy
		var target = block[targetSymbol]
		var buffer = target.dpackBuffer
		if (!parentArrayBuffer)
			parentArrayBuffer = buffer.buffer
		if (buffer && buffer.buffer === parentArrayBuffer) {
			var byteOffset = buffer.byteOffset
			target.dpackBuffer = newParentNodeBuffer.slice(byteOffset, byteOffset + buffer.length)
		}
		var buffer = target.sizeTableBuffer
		if (buffer && buffer.buffer === parentArrayBuffer) {
			var byteOffset = buffer.byteOffset
			target.sizeTableBuffer = newParentNodeBuffer.slice(byteOffset, byteOffset + buffer.length)
		}
		if (target.parsed) {
			var parsed = target.parsed
			for (var key in parsed) {
				var value = parsed[key]
				if (isBlock(value)) {
					reassignBuffers(value, newParentNodeBuffer, parentArrayBuffer)
				}
			}
		}
	}

var copyOnWriteHandler = {
	get: function(target, key) {
		if (specialGetters.hasOwnProperty(key)) {
			return specialGetters[key].call(target)
		}
		var cachedParsed = target.cachedParsed
		if (cachedParsed && cachedParsed.hasOwnProperty(key)) {
			return cachedParsed[key]
		}
		var parsed = target.parsed
		if (!parsed) {
			parsed = getParsed(target)
		}
		var value = parsed[key]
		if (value && value[targetSymbol]) {
			if (!cachedParsed) {
				target.cachedParsed = cachedParsed = {}
			}
			cachedParsed[key] = value = copyWithParent(value, target)
		}
		return value
	},
	changed: function(target) {
		target.dpackBuffer = null
		target.sizeTableBuffer = null
		var parsed = target.parsed
		if (!parsed) {
			parsed = getParsed(target)
		}
		if (!target.copied) {
			var cachedParsed = target.cachedParsed
			var copied = target.parsed = target.cachedParsed = {}
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
		if (target.parent) {
			copyOnWriteHandler.changed(target.parent)
		}
		return parsed
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
	return this.dpackBuffer || getSerialized(this).dpackBuffer
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
	if (!this.dpackBuffer) {
		getSerialized(this)
	}
	return this.sizeTableBuffer
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
		return source
	}
	return new Proxy({
		get parsed() {
			return source[parsedSymbol]
		},
		set parsed(value) {
			Object.defineProperty(this, 'parsed', {
				value: value,
				writable: true,
				enumerable: true
			})
		},
		get dpackBuffer() {
			return source[bufferSymbol]
		},
		set dpackBuffer(value) {
			Object.defineProperty(this, 'dpackBuffer', {
				value: value,
				writable: true,
				enumerable: true
			})
		},
		get sizeTableBuffer() {
			return source[sizeTableSymbol]
		},
		set sizeTableBuffer(value) {
			Object.defineProperty(this, 'sizeTableBuffer', {
				value: value,
				writable: true,
				enumerable: true
			})
		},
		shared: source.shared,
		parent: parent
	}, copyOnWriteHandler)
}
exports.copy = copy

var specialSetters = {
}
/*specialSetters[bufferSymbol] = function(buffer) {
	this.buffer = buffer
	this.parsed = undefined
}*/

function getParsed(target) {
	var parsed = target.parsed
	if (parsed)
		return parsed
	// we check to see if there are multiple blocks that should be deferred into separate blocks
	var sizeTableBuffer = target.sizeTableBuffer
	var dpackBuffer = target.dpackBuffer
	if (!sizeTableBuffer) {
		// no child blocks, just dpack, so directly parse
		var parser = createParser({
			freezeObjects: process.env.NODE_ENV != 'production'
		})
		parser.setSource(dpackBuffer.toString())
		return target.parsed = parser.read()
	}
	var totalSizeTableLength = sizeTableBuffer.length
	var totalDPackLength
	var rootBlockLength
	var type = sizeTableBuffer[0] >> 6
	var offset
	if (type === 2) {
		rootBlockLength = sizeTableBuffer.readUInt16BE(4)
		offset = 6
	} else {
		rootBlockLength = sizeTableBuffer.readUIntBE(10, 6)
		offset = 16
	}
	// read child block lengths: (could defer this until child access)
	var childSizeTables = []
	var childDpackBlocks = []
	var dpackChildOffset = rootBlockLength
	while (offset < totalSizeTableLength) {
		var type = sizeTableBuffer[offset] >> 6
		var sizeTableLength
		var dpackLength
		if (type < 2) { // leaf node
			if (type == 0) {
				// 6 bit
				sizeTableLength = 1
				dpackLength = sizeTableBuffer[offset]
			} else {
				// 14 bit
				sizeTableLength = 2
				dpackLength = sizeTableBuffer.readUInt16BE(offset) & 0x3fff
			}
		} else if (type === 2) {
			sizeTableLength = sizeTableBuffer.readUInt16BE(offset) & 0x3fff
			dpackLength = sizeTableBuffer.readUInt16BE(offset + 2)
		} else {
			sizeTableLength = sizeTableBuffer.readUInt32BE(offset) & 0x3fffffff
			dpackLength = sizeTableBuffer.readUIntBE(offset + 4, 6)
		}
		childSizeTables.push(type < 2 ||
			(type == 3 && sizeTableLength == 16) ? // type 3 with a length of 16 is a long leaf node
			undefined : sizeTableBuffer.slice(offset, offset + sizeTableLength))
		offset += sizeTableLength
		childDpackBlocks.push(dpackBuffer.slice(dpackChildOffset, dpackChildOffset += dpackLength))
	}
	var blockIndex = 0
	var parser = createParser(childDpackBlocks.length > 0 ? { // if no child blocks, use normal deferred parsing
		shared: target.shared,
		forDeferred: function() {
			return new Proxy({
				dpackBuffer: childDpackBlocks[blockIndex],
				sizeTableBuffer: childSizeTables[blockIndex++]
			}, onDemandHandler)
		},
		freezeObjects: process.env.NODE_ENV != 'production'
	} : {
		shared: target.shared
	})
	var rootBlock = target.dpackBuffer.slice(0, rootBlockLength)
	parser.setSource(rootBlock.toString())
	return target.parsed = parser.read()
}

function getSerialized(target) {
	var childBlocks = []
	var childSizeTables = []
	var childDpackSizes = 0
	var serializerOptions = {
		forBlock: function(block) {
			var dpackBuffer = block[bufferSymbol]
			var sizeTableBuffer = block[sizeTableSymbol]
			if (!sizeTableBuffer) {
				// if this child has no children, it won't have have size table, just create a leaf branch buffer
				var bufferLength = dpackBuffer.length
				if (bufferLength < 64) {
					// one byte leaf node
					sizeTableBuffer = Buffer.from([bufferLength])
				} else if (bufferLength < 0x4000) {
					// binary-10 and then 14 bits
					sizeTableBuffer = Buffer.from([(bufferLength >> 8) | 0x40, bufferLength & 0xff])
				} else {
					sizeTableBuffer = Buffer.allocUnsafe(16)
					sizeTableBuffer.writeUInt32BE(0xc0000010) // binary-11 and then indicate a size of 16
					sizeTableBuffer.writeUIntBE(bufferLength, 4, 6)
					sizeTableBuffer.writeUIntBE(bufferLength, 10, 6)
				}
			}
			childSizeTables.push(sizeTableBuffer)
			childDpackSizes += dpackBuffer.length
			childBlocks.push(dpackBuffer)
			return dpackBuffer
		},
		shared: target.shared,
		freezeObjects: process.env.NODE_ENV != 'production'
	}
	var rootBlock = serialize(target.parsed, serializerOptions)
	if (childBlocks.length == 0) {
		// no child blocks, just use the root block
		target.dpackBuffer = rootBlock
		return target
	}
	childBlocks.unshift(rootBlock)
	// TODO: Do word aligment with any buffer copying, to make sure CPU can copy words instead of bytes
	var dpackBuffer = target.dpackBuffer = Buffer.concat(childBlocks)
	var ourSizeBlock = Buffer.allocUnsafe(dpackBuffer.length >= 0x10000 ? 16 : 6)
	childSizeTables.unshift(ourSizeBlock)
	// TODO: Add length parameter to concat so it is length % 8 = 0
	ourSizeBlock = target.sizeTableBuffer = Buffer.concat(childSizeTables)
	if (dpackBuffer.length >= 0x10000) { // || ourSizeBlock.length > 0x4000
		ourSizeBlock.writeUInt32BE(ourSizeBlock.length + 0xc0000000, 0) // binary-11 and then 30 bits
		ourSizeBlock.writeUIntBE(dpackBuffer.length, 4, 6) // 48 bits
		ourSizeBlock.writeUIntBE(rootBlock.length, 10, 6) // 48 bits
	} else {
		ourSizeBlock.writeUInt16BE(ourSizeBlock.length | 0x8000, 0) // binary-10 and then 14 bits
		ourSizeBlock.writeUInt16BE(dpackBuffer.length, 2) // 16 bits
		ourSizeBlock.writeUInt16BE(rootBlock.length, 4) // 16 bits

	}
	return target
}

serialize.Block = Block
var createParser = require('./parse').createParser
