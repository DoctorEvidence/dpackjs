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
	var buffer = target.buffer
	var parser = createParser()
	return parseHeader(buffer, parser, 0)
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
	// we check to see if there are multiple blocks that should be deferred into separate blocks
	var buffer = target.buffer
	var parser = createParser()
	var primaryBuffer
	var parseInformation = parseBlockHeader(buffer, parser, 0)
	if (parseInformation && parseInformation.topLevelElements > 4) {
		var blocks = parser.blocks
		var offset = parseInformation.contentOffset
		while(parseInformation = parseBlockHeader(buffer, parser, offset)) {
			var id = parseInformation.id
			var startOfBlock = parseInformation.contentOffset
			var endOfBlock = startOfBlock + parseInformation.length
			if (id === null) {
				primaryBuffer = buffer.slice(startOfBlock, endOfBlock)
			} else {
				blocks[id] = new Proxy({
					buffer: buffer.slice(startOfBlock, endOfBlock)
				}, binaryMapped)
			}
			offset = endOfBlock
		}
	} else {
		primaryBuffer = buffer
	}
	return target.parsed = parser.setSource(primaryBuffer.toString(), 0).read()
}

function getSerialized(target) {
	return target.buffer = serialize(target.parsed, {
		withLength: true
	})
}

function parseBlockHeader(buffer, parser, offset) {
	var firstByte = buffer[offset]
	// we check to see if the main entry is a block
	if ((firstByte & 80) === 80) {
		// read enough to read the header parts
		var headerParts = parser.setSource(buffer.slice(offset, offset + 20).toString())
		var topLevelElements = headerParts.readValue()
		var id = headerParts.readValue() // first is the id
		if (id > 0) {
			id = id - 4 // handle as default value
		}
		var imports = headerParts.readValue() // next imports
		var length = headerParts.readValue() // next length
		offset = offset + parser.getOffset() // find the offset of the start of the block content
		return {
			id: id,
			imports: imports,
			length: length,
			parser: parser,
			topLevelElements: topLevelElements,
			contentOffset: offset
		}
	}
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

serialize.Block = Block
var createParser = require('./parse').createParser
