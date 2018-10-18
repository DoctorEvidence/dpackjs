"use strict"
const BLOCK_TYPE = 5
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
specialGetters.then = function() {
	// return undefined, this is not a promise
}
specialGetters.valueOf = function() {
	return valueOf
}
function valueOf() {
	return this[parsedSymbol]
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
	var objects = []
	var primaryBuffer
	var byte = buffer[0]
	var referencingPropertyId
	var referenceIndex = 1
	// we check to see if the main entry is a block
	if (buffer[0] === 91) { // first byte is open sequence, next two are block property id, then block
		// read enough to read the header parts
		var offset = 1
		do {
			var blockParser = parser.setSource(buffer.slice(offset, offset + 20).toString())
			var propertyType = blockParser.readValue()
			if (propertyType >= 6 && (!referencingPropertyId || referencingPropertyId === propertyType)) {
				referencingPropertyId = propertyType
			} else {
				primaryBuffer = Buffer.concat([Buffer.from([91]), buffer.slice(offset)])
				break
			}
			var nextValue = blockParser.readValue()
			var blockLength
			if (nextValue === 2) {
				blockParser.readValue() // dispose the key
				blockLength = blockParser.readValue() - 16
			} else if (!referencingPropertyId) {
				// no referencing property id and no declaration of a referencing type, so break out
				primaryBuffer = Buffer.concat([Buffer.from([91]), buffer.slice(offset)])
				break
			} else {
				blockLength = nextValue - 16
			}
			var startOfBlock = offset + blockParser.getOffset()
			var endOfBlock = startOfBlock + blockLength
			objects.push(new Proxy({
				buffer: buffer.slice(startOfBlock, endOfBlock)
			}, binaryMapped))
			offset = endOfBlock
		} while (true)
		parser.assignValues(referencingPropertyId, objects)
	} else {
		primaryBuffer = buffer
	}
	return target.parsed = parser.setSource(primaryBuffer.toString(), 0, referenceIndex).read()
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
