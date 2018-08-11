"use strict"
var serialize = require('./serialize').serialize
var makeSymbol = typeof Symbol !== 'undefined' ? Symbol : function(name) {
	return 'symbol-' + name
}
var bufferSymbol = makeSymbol('buffer')
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
exports.makeBlockFromBuffer = function(buffer) {
	return new Proxy({
		buffer: buffer
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
	if (firstByte === 0x4c) { // must start with a value with length definition for lazy evaluation
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
serialize.Block = Block
var createParser = require('./parse').createParser
