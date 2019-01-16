"use strict"
const BLOCK_TYPE = 5
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
specialGetters.next = function() {
	// return undefined, this is not an iterator
}
specialGetters.put = function() {
	// return undefined, this is not a variable
}
specialGetters.notifies = function() {
	// return undefined, this is not a variable
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
	var blockParser = createBinaryParser()
	var parser = createParser()
	var objects = []
	var primaryBuffer
	blockParser.setSource(buffer)
	var value = blockParser.readValue()
	var referencingPropertyId
	var referenceIndex = 1
	// we check to see if the main entry is a block
	var offset = 1
	var startSequenceBlock
	if (value.type === 0 && value.number === 1) { // array
		value = blockParser.readValue()
		if (value.type === 3 && value.number === 0) { // null
			value = blockParser.readValue()
			offset = 3
		}
	}
	if (value.type === 1 && value.number === 11) { // first byte is open sequence, next two are block property id, then block
		// read enough to read the header parts
		startSequenceBlock = buffer.slice(0, offset)
		do {
			blockParser.setSource(buffer, offset)
			value = blockParser.readValue()
			var mainBlock
			var blockLength
			if (value.type === 0) {
				if (value.number >= 6) {
					referencingPropertyId = value.number
					value = blockParser.readValue() // read property definition
					if (value.type === 0) {
						value = blockParser.readValue() // read property key
						value = blockParser.readValue() // read block length (hopefully)
					}
				} else {
					mainBlock = true
				}
			}
			if (value.type === 1) {
				blockLength = value.number
				if (blockLength < 16)
					mainBlock = true
				else
					blockLength -= 16
			}
			if (!referencingPropertyId || mainBlock) {
				primaryBuffer = Buffer.concat([startSequenceBlock, buffer.slice(offset)])
				break
			}
			var startOfBlock = blockParser.getOffset()
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
