"use strict"
var CANT_DECODE = {}
function createParser(options) {
	var source
	var offset = 0
	return {
		setSource: function(buffer, newOffset) {
			source = buffer
			offset = newOffset || 0
		},
		getOffset: function() {
			return offset
		},
		readValue: function(decode) {
			var type, number
			var token = source[offset++]
			if (token >= 0x40) { // fast path for one byte with stop bit
				if (token > 0x4000) { // long-token handling
					type = (token >>> 12) & 3
					number = token & 0xfff
				} else {
					type = (token >>> 4) & 3
					number = token & 0xf
				}
			} else {
				type = (token >>> 4) & 11 // shift and omit the stop bit (bit 3)
				number = token & 0xf
				token = source[offset++]
				number = (number << 6) + (token & 0x3f) // 10 bit number
				if (!(token >= 0x40)) {
					token = source[offset++]
					number = (number << 6) + (token & 0x3f) // 16 bit number
					if (!(token >= 0x40)) {
						token = source[offset++]
						number = (number << 6) + (token & 0x3f) // 22 bit number
						if (!(token >= 0x40)) {
							token = source[offset++]
							number = (number << 6) + (token & 0x3f) // 28 bit number
							if (!(token >= 0x40)) {
								token = source[offset++]
								number = (number * 0x40) + (token & 0x3f) // 34 bit number (we can't use 32-bit shifting operators anymore)
								if (!(token >= 0x40)) {
									token = source[offset++]
									number = (number * 0x40) + (token & 0x3f) // 40 bit number
									if (!(token >= 0x40)) {
										token = source[offset++]
										number = (number * 0x40) + (token & 0x3f) // 46 bit number, we don't go beyond this
										if (!(token >= 0)) {
											if (offset > source.length) {
												throw new Error('Unexpected end of dpack stream')
											}
										}
									}
								}
							}
						}
					}
				}
			}
			if (decode) {
				if (type === 3) {
					if (number === 0) {
						return null
					} else if (number === 2) {
						return true
					} else if (number === 3) {
						return false
					} else {
						return undefined
					}
					return number - 4
				} else if (type === 2) {
					// TODO: Do we need to increment the offset
					return readString(source, offset, number)
				}
				return CANT_DECODE
			}
			return {
				type: type,
				number: number
			}
		}
	}
}
exports.createParser = createParser

function readString(buffer, offset, stringLength) {
	var estimatedByteLength = stringLength + (stringLength >> 4)
	do {
		var string = buffer.toString('utf8', offset, estimatedByteLength)
		var createdStringLength = string.length
		if (createdStringLength === stringLength && string.charCodeAt(createdStringLength - 1) !== 65533) {
			//offset += estimatedByteLength
			return string // no slice needed
		}
		if (createdStringLength > stringLength) {
			//var unused = string.slice(stringLength)
			//offset += estimatedByteLength - Buffer.from(unused).length
			return string.slice(0, stringLength)
		}
		estimatedByteLength += (stringLength - createdStringLength) * 2 + 1
	} while(true)	
}

const { StringDecoder } = require('string_decoder')

function readString(buffer, offset, stringLength) {
	var decoder = new StringDecoder('utf8')
	var estimatedByteRemaining = stringLength
	do {
		var string = decoder.write(buffer.slice(offset, offset += estimatedByteRemaining))
		if (string.length === stringLength) {
			return string
		}
		estimatedByteRemaining = stringLength - string.length
	} while(true)	
}

