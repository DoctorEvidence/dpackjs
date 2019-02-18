"use strict"
const BLOCK_TYPE = 5
var makeSymbol = typeof Symbol !== 'undefined' ? Symbol : function(name) {
	return 'symbol-' + name
}
var bufferSymbol = makeSymbol('buffer')
var sizeTableSymbol = makeSymbol('sizeTable')
var headerSymbol = makeSymbol('header')
var parsedSymbol = makeSymbol('parsed')

function Block() {}
exports.Block = Block
exports.bufferSymbol = bufferSymbol
exports.parsedSymbol = parsedSymbol
var serialize = require('./serialize').serialize
var createBinaryParser = require('./binary-parse').createParser
exports.asBlock = function(object) {
	if (object && object.constructor === Block) {
		return object // already a block
	}
	return new Proxy({
		parsed: object
	}, binaryMapped)
}
exports.makeBlockFromBuffer = function(buffer, imports) {
	var target = {
		buffer: buffer,
		imports: imports
		reassign: function(buffer) { // TODO: don't create each time
			this.buffer = buffer
		}
	}
	buffer.owner = target
	return new Proxy(target, binaryMapped)
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
		var value = parsed[key]
		if (value && typeof value === 'object') {

		}
	},
	set: function(target, key, value) {
		if (specialSetters.hasOwnProperty(key)) {
			specialSetters[key].call(target, value)
			return true
		}
		var parsed = target.parsed
		if (!parsed) {
			parsed = getParsed(target)
		}
		// invalidate the buffer, it is no longer a valid representation
		target.buffer = null
		parsed[key] = value
		return true
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
	}
}

var copyOnWriteHandler = {
	get: function(target, key) {
		if (specialGetters.hasOwnProperty(key)) {
			return specialGetters[key].call(target)
		}
		var copied = target.copied
		if (copied && copied.hasOwnProperty(key)) {
			return copied[key]
		}
		var parsed = target.parsed
		if (!parsed) {
			parsed = getParsed(target)
		}
		var value = parsed[key]
		if (value && value[bufferSymbol]) {
			if (!copied) {
				target.copied = {}
			}
			copied[key] = value = new Proxy({
				[bufferSymbol]: value[bufferSymbol],
				[sizeTableSymbol]: value[sizeTableSymbol],
				parsed: value,
				parent: target
			}, copyOnWriteHandler)
		} else if (copied) {
			copied[key] = value
		}
		return value
	},
	changed: function(target) {
		if (target.hasOwnProperty(bufferSymbol)) {
			target[bufferSymbol] = null
		} else {
			copyOnWriteHandler.changed(target.parent)
		}
		
	},
	set: function(target, key, value) {
		if (specialSetters.hasOwnProperty(key)) {
			specialSetters[key].call(target, value)
			return true
		}
		var copied = target.copied || (target.copied = {})
		copyOnWriteHandler.changed(target)
		copied[key] = value
		return true
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
	}
}

var specialGetters = {
	constructor: function() {
		return Block
	},
	getCopy: function() {
		return getCopy
	},
	getFullCopy: function() {
		// recursively copy entire object graph into plain JS objects
	}
}
specialGetters[bufferSymbol] = function() {
	return this.dpackBuffer || getSerialized(this).dpackBuffer
}
specialGetters[headerSymbol] = function() {
	var buffer = target.buffer
	var parser = createParser()
	return parseHeader(buffer, parser, 0)
}
specialGetters[parsedSymbol] = function() {
	return this.parsed || getParsed(this)
}
specialGetters.then = function() {
	// return undefined, this is not a promise
}
specialGetters.valueOf = function() {
	return valueOf
}
function valueOf() {
	return this[parsedSymbol]
}
function getCopy() {
	return new Proxy(this, copyOnWriteHandler)
}

var specialSetters = {
}
specialSetters[bufferSymbol] = function(buffer) {
	this.buffer = buffer
	this.parsed = undefined
}

function getFixedTable(target) {
	var buffer = target.buffer

}

function getParsed(target) {
	var parsed = target.parsed
	if (parsed)
		return parsed
	// we check to see if there are multiple blocks that should be deferred into separate blocks
	var buffer = target.buffer
	var dpackOffset = buffer.readUint32BE(0)
	var totalDPackLength = buffer.readUint32BE(4)
	var rootBlockLength = buffer.readUint32BE(8)

	// read child block lengths: (could defer this until child access)
	let offset = 0
	let childSizeTables = []
	let childDpackBlocks = []
	let dpackChildOffset = dpackOffset
	while (offset < dpackOffset) {
		let sizeTableLength = buffer.readUint32BE(offset)
		let dpackLength = buffer.readUint32BE(offset + 4)
		childSizeTables.push(buffer.slice(offset, offset += sizeTableLength))
		childDpackBlocks.push(buffer.slice(dpackChildOffset, dpackChildOffset += dpackLength))
	}
	let blockIndex = 0
	var parser = createParser({
		forDeferred() {
			return new Proxy({
				[bufferSymbol]: childDpackBlocks[blockIndex++],
				[sizeTableSymbol]: childSizeTables[blockIndex]
			}, onDemandHandler)
		},
		freezeObjects: process.env.NODE_ENV != 'production'
	})
	target.dpackBuffer = buffer.slice(dpackOffset, dpackOffset + totalDPackLength)
	var rootBlock = target.dpackBuffer.slice(dpackOffset, dpackOffset + rootBlockLength)
	parser.setSource(rootBlock)
	target.parsed = parser.read()
}

function getSerialized(target) {
	var childBlocks = []
	var childSizeTables = []
	var childDpackSizes = 0
	var serializerOptions = {
		forBlock(block) {
			var target = block.getSerialized(block)
			childSizeTables.push(target.sizeTableBuffer)
			childDpackSizes += target.dpackBuffer.length
			childBlocks.push(target.dpackBuffer)
			return target.dpackBuffer
		},
		freezeObjects: process.env.NODE_ENV != 'production'
	}
	childBlocks.unshift(rootBlock)
	target.dpackBuffer = Buffer.concat(childBlocks)
	var rootBlock = serialize(target.parsed, serializerOptions)
	var ourSizeBlock = Buffer.allocUnsafe(12)
	childSizeTables.unshift(ourSizeBlock)
	ourSizeBlock = target.sizeTableBuffer = Buffer.concat(childSizeTables)
	ourSizeBlock.writeUInt32BE(ourSizeBlock.length, 0)
	ourSizeBlock.writeUInt32BE(target.dpackBuffer.length, 4)
	ourSizeBlock.writeUInt32BE(rootBlock.length, 8)
	return target
}

var readBlockLengthHandler = [
	returnNull,
	function(length) {
		return length
	},
	returnNull,
	returnNull
]
function returnNull() {
	return null
}

function makeChildObjectProxy(object) {
	new Proxy(object, {

	})
}

serialize.Block = Block
var createParser = require('./parse').createParser
