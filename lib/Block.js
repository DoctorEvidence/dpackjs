"use strict"
var serialize = require('./serialize').serialize
var makeSymbol = typeof Symbol !== 'undefined' ? Symbol : function(name) {
	return 'symbol-' + name
}
var bufferSymbol = makeSymbol('buffer')
var headerSymbol = makeSymbol('header')
var parsedSymbol = makeSymbol('parsed')

function Block() {}
exports.Block = Block
exports.bufferSymbol = bufferSymbol
exports.parsedSymbol = parsedSymbol
exports.asBlock = function(object) {
	return new Proxy({
		parsed: object
	}, binaryMapped)
}
exports.makeBlockFromBuffer = function(buffer, imports) {
	return new Proxy({
		buffer: buffer,
		imports: imports
	}, binaryMapped)
}

var binaryMapped = {
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

var specialGetters = {
	constructor: function() {
		return Block
	}
}
specialGetters[bufferSymbol] = function() {
	return this.buffer || getSerialized(this)
}
specialGetters[headerSymbol] = function() {
	return parseHeader(this)
}
specialGetters[parsedSymbol] = function() {
	return this.parsed || getParsed(this)
}
var specialSetters = {
}
specialSetters[bufferSymbol] = function(buffer) {
	this.buffer = buffer
	this.parsed = undefined
}

function getParsed(target) {
	var parsed = target.parsed
	if (parsed)
		return parsed
	var buffer = target.buffer
	var parser = createParser()
	var primaryBuffer
	var firstByte = buffer[0]
	// we check to see if there are multiple blocks that should be deferred into separate blocks
	if (firstByte & 80 === 80) { // must be a block to do multi-block deferred parsing
		var referenceableValues = parser.referenceableValues
		var length = parser.setSource(buffer.slice(1, 13).toString()).readOpen() // read first block as number
		var offset = parser.getOffset() + 1 // skip block-begin token
		primaryBuffer = buffer.slice(offset, offset += length)
		// now iterate through any other referable/lazy objects and declare them
		while (offset < buffer.length) {
			firstByte = buffer[offset]
			if (firstByte === 0x4b) { // must have an identified-value token
				var headerString = buffer.slice(offset + 1, offset + 13).toString()
				var id = parser.setSource(headerString).readOpen()
				var afterIdOffset = parser.getOffset()
				parser.setSource(headerString, afterIdOffset + 1) // skip the length-definition token
				length = parser.readOpen()
				var nextBuffer = buffer.slice(offset + afterIdOffset + 1, offset += parser.getOffset() + length + 2)
				referenceableValues[id] = new Proxy({
					buffer: nextBuffer,
				}, binaryMapped)
			} else {
				primaryBuffer = buffer
				break
			}
		}
	} else {
		primaryBuffer = buffer
	}
	return target.parsed = parser.setSource(primaryBuffer.toString(), 0).readOpen()
}

function getSerialized(target) {
	return target.buffer = serialize(target.parsed, {
		withLength: true
	})
}

function parseHeader(target) {
	var parser = createParser()
	var buffer = target.buffer
	var firstByte = buffer[0]
	// we check to see if the main entry is a block
	if (firstByte & 80 === 80) {
		// read enough to read the header parts
		var headerParts = parser.setSource(buffer.slice(0, 20).toString())
		var headerElements = headerParts.readNext(readBlockLengthHandler)()
		var id = headerParts.read() // first is the id
		var imports = headerParts.read() // next imports
		var length = headerParts.read() // next length
		var offset = parser.getOffset() + 1 // find the offset of the start of the block content
		return {
			id: id,
			imports: imports,
			length: length,
			headerElements: headerElements,
			contentOffset: offset
		}
	}
}

readBlockLengthHandler = {
	returnNull,
	function(length) {
		return length
	},
	returnNull,
	returnNull
}
function returnNull() {
	return null
}

serialize.Block = Block
var createParser = require('./parse').createParser
