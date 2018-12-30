(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory();
	else if(typeof define === 'function' && define.amd)
		define([], factory);
	else if(typeof exports === 'object')
		exports["dpack"] = factory();
	else
		root["dpack"] = factory();
})(window, function() {
return /******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, { enumerable: true, get: getter });
/******/ 		}
/******/ 	};
/******/
/******/ 	// define __esModule on exports
/******/ 	__webpack_require__.r = function(exports) {
/******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 		}
/******/ 		Object.defineProperty(exports, '__esModule', { value: true });
/******/ 	};
/******/
/******/ 	// create a fake namespace object
/******/ 	// mode & 1: value is a module id, require it
/******/ 	// mode & 2: merge all properties of value into the ns
/******/ 	// mode & 4: return value when already ns object
/******/ 	// mode & 8|1: behave like require
/******/ 	__webpack_require__.t = function(value, mode) {
/******/ 		if(mode & 1) value = __webpack_require__(value);
/******/ 		if(mode & 8) return value;
/******/ 		if((mode & 4) && typeof value === 'object' && value && value.__esModule) return value;
/******/ 		var ns = Object.create(null);
/******/ 		__webpack_require__.r(ns);
/******/ 		Object.defineProperty(ns, 'default', { enumerable: true, value: value });
/******/ 		if(mode & 2 && typeof value != 'string') for(var key in value) __webpack_require__.d(ns, key, function(key) { return value[key]; }.bind(null, key));
/******/ 		return ns;
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = "./browser.js");
/******/ })
/************************************************************************/
/******/ ({

/***/ "./browser.js":
/*!********************!*\
  !*** ./browser.js ***!
  \********************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

var serialize = __webpack_require__(/*! ./lib/serialize */ "./lib/serialize.js")
var parse = __webpack_require__(/*! ./lib/parse */ "./lib/parse.js")
var Options = __webpack_require__(/*! ./lib/Options */ "./lib/Options.js").Options

exports.serialize = serialize.serialize
exports.parse = parse.parse
exports.createSerializer = serialize.createSerializer
exports.createParser = parse.createParser
exports.parseLazy = parse.parseLazy
exports.asBlock = __webpack_require__(/*! ./lib/Block */ "./lib/Block.js").asBlock
exports.Options = Options
exports.fetch = __webpack_require__(/*! ./fetch */ "./fetch.js").fetch
exports.XMLHttpRequest = __webpack_require__(/*! ./xhr */ "./xhr.js").XMLHttpRequest


/***/ }),

/***/ "./fetch.js":
/*!******************!*\
  !*** ./fetch.js ***!
  \******************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var createParser = __webpack_require__(/*! ./lib/parse */ "./lib/parse.js").createParser

window.createParser = createParser
var serialize = window.serialize = __webpack_require__(/*! ./lib/serialize */ "./lib/serialize.js").serialize
function readResponse(response, onProgress) {
	var reader = response.body.getReader()
	return new Promise(function(resolve, reject) {
		var parser
		var parsedData
		var queuedBytes
		function queueUnfinishedChar(bytes) {
			// this checks to see if we end the bytes in the middle of a character, and need to queue bytes for the next chunk
			var length = bytes.length
			var lastStart = length - 1
			if (bytes[lastStart] < 0x80) {
				queuedBytes = null
				return bytes
			}
			while (lastStart >= 0) {
				var byte = bytes[lastStart]
				if (byte >= 0xC0) {
					var charLength = byte >= 0xE0 ? byte >= 0xF0 ? 4 : 3 : 2
					var needs = charLength - length + lastStart
					if (needs > 0) {
						queuedBytes = bytes.slice(lastStart, length - lastStart)
						queuedBytes.needs = needs
						return bytes.slice(0, lastStart)
					}
					queuedBytes = null
					return bytes
				}
				lastStart--
			}
			queuedBytes = null
			return bytes
		}
		var decoder = new TextDecoder()
		function readNext() {
			reader.read().then(function(next) {
				if (next.done) {
					resolve(parsedData)
				} else {
					var bytes = next.value
					var sourceText
					if (queuedBytes) {
						// if we are resuming from the middle of a character, concatenate the bytes and decode it
						sourceText = decoder.decode(new Uint8Array(Array.from(queuedBytes).concat(Array.from(bytes.slice(0, queuedBytes.needs)))))
						// and then remove the consumed byte(s)
						bytes = bytes.slice(queuedBytes.needs)
						bytes = queueUnfinishedChar(bytes)
						sourceText += decoder.decode(bytes)
					} else {
						bytes = queueUnfinishedChar(bytes)
						sourceText = decoder.decode(bytes)
					}
					if (parser) {
						if (parser.onResume) {
							var updatedData = parser.onResume(sourceText, true)
							parsedData = parsedData || updatedData
						}
					} else {
						parser = createParser()
						parser.setSource(sourceText, 0, true)
						parsedData = parser.read()
					}
					parser.read()
					readNext()
				}
			})
		}
		function onError(error) {
			if (error.message == 'Unexpected end of dpack stream') {
				parsedData = parsedData || error.valueInProgress
				if (onProgress) {
					onProgress(parsedData, response)
				}
			} else {
				reject(error)
			}
		}
		readNext()
	})
}
exports.readResponse = readResponse
exports.fetch = function(url, request) {
	(request.headers || (request.headers = {}))['Accept'] = 'text/dpack;q=1,application/json;q=0.7'
	var fetchResponse = fetch(url, request)
	fetchResponse.then(function(response) {
		response.dpack = function(onProgress) {
			return readResponse(response, onProgress)
		}
		return response
	})
	return fetchResponse
}


/***/ }),

/***/ "./lib/Block.js":
/*!**********************!*\
  !*** ./lib/Block.js ***!
  \**********************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

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
var serialize = __webpack_require__(/*! ./serialize */ "./lib/serialize.js").serialize
var createBinaryParser = __webpack_require__(/*! ./binary-parse */ "./lib/binary-parse.js").createParser
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
var createParser = __webpack_require__(/*! ./parse */ "./lib/parse.js").createParser


/***/ }),

/***/ "./lib/Options.js":
/*!************************!*\
  !*** ./lib/Options.js ***!
  \************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

function Options() {
	var classByName = this.classByName = new Map()
	this.converterByConstructor = new Map()
	//writerByConstructor.set(Map, writeMap)
	//writerByConstructor.set(Set, writeSet)
}
Options.prototype.addExtension = function(Class, name, options) {
	if (name && Class.name !== name) {
		Class.name = name
	}
	this.classByName.set(Class.name, (options && options.fromArray) ? options : Class)
	this.converterByConstructor.set(Class, (options && options.toArray) ? options : Class)
}
exports.Options = Options


/***/ }),

/***/ "./lib/binary-parse.js":
/*!*****************************!*\
  !*** ./lib/binary-parse.js ***!
  \*****************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

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
		readValue: function() {
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
			return {
				type: type,
				number: number
			}
		}
	}
}
exports.createParser = createParser


/***/ }),

/***/ "./lib/parse.js":
/*!**********************!*\
  !*** ./lib/parse.js ***!
  \**********************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


// these are the codes that are used to determine the rudimentary type of numbers
var PROPERTY_CODE = 0
var SEQUENCE_CODE = 1
var STRING_CODE = 2
var NUMBER_CODE = 3

// these are the starting codes (structures also use this space) for complete types
var METADATA_TYPE = 0
var ARRAY_TYPE = 1
var REFERENCING_TYPE = 2
var NUMBER_TYPE = 3
var DEFAULT_TYPE = 4
var EXTENSIONS = 5

var NULL = 0
var UNDEFINED = 1
var TRUE = 2
var FALSE = 3

// referrer types
var REFERRER_NONE = 0
var REFERRER_NEXT = 1
var REFERRER_CHILD = 2
var REFERRER_PROPERTY = 3

var MAX_LENGTH = 1024*1024*16
var END_SEQUENCE = {}
var PAUSED = {}

function createParser(options) {
	if (!options)
		options = {}
	var offset
	var source
	var property = {}
	var isPartial
	var lastRead
	var properties = []
	var classByName = options.classByName || new Map()
	classByName.set('Map', readMap)
	classByName.set('Set', readSet)
	classByName.set('Date', readDate)
	var currentBlock
	var referrerProperty
	var referrerType
	var pausedState

	function pause(state, lastRead) {
		state.previous = pausedState
		state.resume = true
		pausedState = state
		if (!isPartial)
			throw new Error('Unexpected end of dpack stream')

		if (!parser.onResume) // only if not already defined, otherwise we just want to use the one from the top of the call stack
			parser.onResume = function(nextString, isPartialString, rebuildString) {
				// top of the resume stack
				var resumeState = pausedState
				pausedState = null
				parser.onResume = null
				// we slice and add these together to generate an entirely new string
				// so we don't cause a memory leak with redundant strings that a retained a slice parents
				if (lastRead < source.length)
					source = source.slice(lastRead) + nextString
				else {
					if (rebuildString) // if we have read all of source, we want to slice and re-concatenate to eliminate the slice reference to the parent, we really don't want that retained in memory
						source = nextString.slice(0, 1) + nextString.slice(1)
					else
						source = nextString
				}
				isPartial = isPartialString
				disposedChars += lastRead
				offset = 0
				return resumeState.reader ? resumeState.reader(resumeState) : readSequence(resumeState.length, resumeState)
			}
		return state.object
	}

	function readSequence(length, thisProperty) {
		var propertyState = 0
		thisProperty = thisProperty || {}
		var previousProperty, property, isArray, object, value, i = 0
		if (thisProperty.resume) { // resuming, thisProperty is the resume state.
			previousProperty = thisProperty.previous
			if (previousProperty) {
				// do the previous/upper stack frame first
				var value = previousProperty.reader ? previousProperty.reader(previousProperty) : readSequence(previousProperty.length, previousProperty)
				var values = previousProperty.values
				if (values) {
					// we have an assignment to referencing values that is waiting for pausing to complete
					if (pausedState) {
						// if still paused, pass on to next pausedState
						pausedState.values = values
					} else {
						if (values.index > -1) {
							// we use this path for fulfilling forward references
							values[values.index++] = value
						} else {
							values.push(value)
						}
					}
				}
			}
			i = thisProperty.i
			object = thisProperty.object
			property = thisProperty.property
			previousProperty = thisProperty.previousProperty
			propertyState = thisProperty.propertyState
			thisProperty = thisProperty.thisProperty
			isArray = thisProperty.type === 1/*ARRAY_TYPE*/
		} else {
			isArray = thisProperty.type === 1/*ARRAY_TYPE*/
			object = thisProperty.constructs ? new thisProperty.constructs() : isArray ? [] : {} // TODO: we could probably construct a new reader that does this a little faster
			if (previousProperty) {
				property = previousProperty.next
			} else {
				property = thisProperty.child
			}
		}
		for (; i < length;) {
			var type, number
			var lastRead = offset
			var token = source.charCodeAt(offset++)
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
				token = source.charCodeAt(offset++)
				number = (number << 6) + (token & 0x3f) // 10 bit number
				if (!(token >= 0x40)) {
					token = source.charCodeAt(offset++)
					number = (number << 6) + (token & 0x3f) // 16 bit number
					if (!(token >= 0x40)) {
						token = source.charCodeAt(offset++)
						number = (number << 6) + (token & 0x3f) // 22 bit number
						if (!(token >= 0x40)) {
							token = source.charCodeAt(offset++)
							number = (number << 6) + (token & 0x3f) // 28 bit number
							if (!(token >= 0x40)) {
								token = source.charCodeAt(offset++)
								number = (number * 0x40) + (token & 0x3f) // 34 bit number (we can't use 32-bit shifting operators anymore)
								if (!(token >= 0x40)) {
									token = source.charCodeAt(offset++)
									number = (number * 0x40) + (token & 0x3f) // 40 bit number
									if (!(token >= 0x40)) {
										token = source.charCodeAt(offset++)
										number = (number * 0x40) + (token & 0x3f) // 46 bit number, we don't go beyond this
										if (!(token >= 0)) {
											if (offset > source.length) {
												return pause({
													length: length,
													thisProperty: thisProperty,
													i: i,
													object: object,
													property: property,
													previousProperty: previousProperty,
													propertyState: propertyState,
												}, lastRead)
											}
										}
									}
								}
							}
						}
					}
				}
			}
			if (type === 0) { /*PROPERTY_CODE*/
				// we store the previous property state in token, so we can assign the next one
				token = propertyState
				if (number < 6) {
					if (number === METADATA_TYPE) {
						// always use existing property
						if (property.block !== currentBlock)
							backupState(property)
						propertyState = 3 // read next value as the metadata parameter
					} else if (number === 5) {
						if (property.block !== currentBlock)
							backupState(property)
						propertyState = 2 // read next value as the key
					} else {
						if (propertyState === 0) {
							// creating new property
							property = {
								type: number,
								key: null,
								next: null // preallocating this helps with performance
							}
							if (currentBlock) {
								property.block = currentBlock
							}
						} else {
							// else if it is preceeded by a reference type, we just modify it
							if (property.block !== currentBlock)
								backupState(property)
							if (property.values) {
								property.values = null // reset this
							}
							if (property.fromValue) {
								property.fromValue = null // reset this
							}
							property.type = number
						}
						propertyState = 2 // read next value as the key
						if (number === 2/*REFERENCING_TYPE*/) {
							property.values = []
						} else if (number === ARRAY_TYPE) {
							property.child = {
								type: DEFAULT_TYPE,
								key: null,
							}
						}
					}
				} else {
					if (propertyState === 0) {
						property = properties[number]
						if (!property) {
							property = properties[number] = {
								index: number,
							}
							if (currentBlock) {
								(currentBlock.indices || (currentBlock.indices = [])).push(number)
							}
						}
					} else if (properties[number]) {
						if (property.block !== currentBlock)
							backupState(property)

						property.values = properties[number].values
						// property.type = properties[number].type // do we need to do this?
					}

					propertyState = 1
				}
				if (token === 0) {
					if (previousProperty) {
						if (previousProperty.block !== currentBlock)
							backupState(previousProperty)
						previousProperty.next = property
					} else { // in array mode, will never have a previousProperty defined
						if (thisProperty.block !== currentBlock)
							backupState(thisProperty)
						thisProperty.child = property
					}
				}
				continue
			}

			if (propertyState < 2 && property && property.type === 2/*REFERENCING_TYPE*/) {
				var values = property.values
				if (currentBlock && property.block !== currentBlock && !(type === 3 && number >= 4)) {
					property.values = values.slice(0) // copy this
					backupState(property)
					property.values = values
				}
			} else {
				values = null
			}
			if (type === 2 /*STRING_CODE*/) {
				value = source.slice(offset, offset += number)
				if (offset > source.length) {
					return pause({
						length: length,
						thisProperty: thisProperty,
						i: i,
						object: object,
						property: property,
						previousProperty: previousProperty,
						propertyState: propertyState,
					}, lastRead)
				}
				if (propertyState < 2) {
					if (property.type === 3/*NUMBER_TYPE*/) {
						value = +value
					} else if (values) {
						if (values.index > -1) {
							// we use this path for fulfilling forward references
							values[values.index++] = value
						} else {
							values.push(value)
						}
					}
				}
			} else if (type === 3) { /*NUMBER_CODE*/
				if (number >= 4) {
					if (values) {
						value = values[number - 4]
						if (value === undefined && !((number - 4) in values)) {
							value = forwardReference(number, values) // forward referencing
						}
					} else {
						value = number - 4
					}
				} else {
					if (number === 0) {
						value = null
					} else if (number === 2) {
						value = true
					} else if (number === 3) {
						value = false
					} else {
						value = undefined
					}
					if (values) {
						if (values.index > -1) {
							// we use this path for fulfilling forward references
							values[values.index++] = value
						} else {
							values.push(value)
						}
					}
				}
			} else { /*SEQUENCE_CODE*/
				if (number === 13) { // end sequence
					return object
				}
				if (number > 10) {
					if (number === 11) {
						value = readSequence(MAX_LENGTH, property)
					} else if (number === 14 || number < 16000000) {
						value = readAsBlock(property)
					}
				} else {
					value = readSequence(number, property)
				}
				if (pausedState) {
					if (value === undefined) { // or a PAUSED object
						pausedState = null // erase anything further up in the stack, as this means the sequence couldn't start, so we need to re-parse from here
						parser.onResume = null
						return pause({
							length: length,
							thisProperty: thisProperty,
							i: i,
							object: object,
							property: property,
							previousProperty: previousProperty,
							propertyState: propertyState,
						}, lastRead)
					} else {
						// need to assign the values *after* the completion of the sequence if it is a forward reference
						pausedState.values = values
					}
				} else if (values) {
					if (values.index > -1) {
						// we use this path for fulfilling forward references
						values[values.index++] = value
					} else {
						values.push(value)
					}
				}
			}
			if (propertyState > 0) {
				// 0: normal
				if (propertyState === 1) { // 1: property reference
					propertyState = 0
				}
				else if (propertyState === 2) { // property key
					propertyState = 1
					property.key = value
					continue // read next value as the property value
				} else { // 3: metadata paramater
					propertyState = 1
					var extendedType = classByName.get(value)
					if (extendedType) {
						if (extendedType.fromValue) {
							property.fromValue = extendedType.fromValue
						} else {
							property.constructs = extendedType
						}
					} else if (options.errorOnUnknownClass) {
						throw new Error('Attempt to deserialize to unknown class ' + parameter)
					} else {
					//	readingProperty.readValue = readAsDefault
					}
					continue // read next value as the property value
				}
			}
			if (property) {
				if (property.fromValue) {
					value = property.fromValue(value)
				}
				if (isArray) {
					if (property.key === null) {
						object.push(value)
					}
					else if (property.key !== undefined && value !== undefined) {
						object[property.key] = value
					}
				} else {
/*					if (!property) {
						throw new Error('No property defined for property in slot ' +  ' value: ' + value)
					}*/
					if (value !== undefined) { // TODO: declare undefined locally?
						var key = property.key
						if (key)
							object[key] = value
						else {
							if (key === null) {
								// for objects null indicates replacing the parent object
								object[0] = value
							} else if (key !== undefined) {
								// could be '', 0, or false, all valid keys, only undefined should be skipped
								object[key] = value
							}
						}
					}
					previousProperty = property
					property = previousProperty.next
				}
			}
			i++
		}
		return object
	}

	function backupState(property) {
		property.block = currentBlock
		var backup = {
			original: property,
			type: property.type,
			first: property.first,
			child: property.child,
			fromValue: property.fromValue,
			values: property.values,
		};
		(currentBlock.properties || (currentBlock.properties = [])).push(backup)
	}

	var currentBlock

	function readAsBlock(property) {
		var value
		if (property.resume) {
			parentBlock = property.parentBlock
			var previous = property.previous
			value = readSequence(previous.length, previous)
			// once we get the value, we don't know which point in the stack could still be resolving
			value = property.object || (previous.thisProperty.isBlock ? value[0] : value)
		} else {
			var parentBlock = currentBlock
			currentBlock = {}
			value = readSequence(1, {
				block: currentBlock,
				isBlock: true,
				child: {
					type: 4,
					block: currentBlock,
					key: null
				}
			})[0]
		}
		if (pausedState && value !== undefined) {
			// restore state of property
			if (!property.resume) {

			}
			pause({
				reader: readAsBlock,
				object: value,
				property: property,
				parentBlock: parentBlock
			})
		} else {
			// restore state from beginning of block
			var backups = currentBlock.properties
			if (backups) {
				for (var i = 0, l = backups.length; i < l; i++) {
					var backup = backups[i]
					var original = backup.original
					original.type = backup.type
					original.values = backup.values
					original.fromValue = backup.fromValue
					original.next = backup.next
					original.child = backup.child
					original.block = parentBlock
				}
			}
			var indices = currentBlock.indices
			if (indices) {
				for (var i = 0, l = indices.length; i < l; i++) {
					properties[indices[i]] = null
				}
			}
			currentBlock = parentBlock
		}
		return value
	}

	function forwardReference(number, values) {
		var object = {}
		values.index = values.index === undefined ? values.length : values.index // make sure we are using index property for maintaining location, since length will change with the property definition
		Object.defineProperty(values, number - 4, {
			set: function(value) {
				Object.assign(object, value)
				if (value && value.constructor === Array) {
					object.length = value.length
					Object.setPrototypeOf(object, Object.getPrototypeOf(value)) // do our best to make it array like
				}
				Object.defineProperty(values, number - 4, {
					value: value,
					configurable: true
				})
				return value
			},
			get: function(value) {
				return object
			},
			configurable: true
		})
		return object
	}

	function unknownType(number) {
		throw new Error('Unknown type ' + number)
	}

	var unfulfilledReferences = 0
	var disposedChars = 0
	function read(result) {
		return readSequence(1, {
			child: {
				type: 4,
				key: null
			}
		})[0]
	}

	var parser = {
		setSource: function(string, startOffset, isPartialString) {
			source = string
			offset = startOffset || 0
			disposedChars = 0
			isPartial = isPartialString
			return this
		},
		hasMoreData: function() {
			return source.length > offset
		},
		isPaused: function() {
			return pausedState
		},
		hasUnfulfilledReferences: function() {
			return unfulfilledReferences > 0
		},
		getOffset: function() {
			return offset + disposedChars
		},
		read: read,
		assignValues: function(propertyId, values) {
			properties[propertyId] = {
				type: 2,
				values: values
			}
		}
	}
	return parser
}
exports.parse = function(stringOrBuffer, options) {
	var source
	if (typeof stringOrBuffer === 'string') {
		source = stringOrBuffer
	} else if (stringOrBuffer && stringOrBuffer.toString) {
		source = stringOrBuffer.toString(options && options.encoding || 'utf8')
	} else { // whatever (undefined or null or whatever), just return it
		return stringOrBuffer
	}
	var parser = createParser(options).setSource(source)
	return parser.read()
}
exports.parseLazy = function(buffer, parser) {
	if ((buffer[0] & 0x30) === 0x10) {
		return makeBlockFromBuffer(buffer, parser || createParser())
	} else if (parser) {
		return parser.setSource(buffer.toString()).read()
	} else {
		return exports.parse(buffer)
	}
}
exports.createParser = createParser
var makeBlockFromBuffer = __webpack_require__(/*! ./Block */ "./lib/Block.js").makeBlockFromBuffer
var bufferSymbol = __webpack_require__(/*! ./Block */ "./lib/Block.js").bufferSymbol

var readMap = {
	fromValue: function(entries) {
		var map = new Map()
		for (var i = 0, l = entries.length; i < l; i++) {
			var entry = entries[i]
			map.set(entry.key, entry.value)
		}
		return map
	}
}
var readSet = {
	fromValue: function(values) {
		var set = new Set(values)
		if (set.size === 0 && values.length > 0) {
			for (var i = 0, l = values.length; i < l; i++) {
				set.add(values[i])
			}
		}
		return set
	}
}
var readDate = {
	fromValue: function(time) {
		return new Date(time)
	}
}



/***/ }),

/***/ "./lib/serialize.js":
/*!**************************!*\
  !*** ./lib/serialize.js ***!
  \**************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
/* WEBPACK VAR INJECTION */(function(global) {
// these are the codes that are used to determine the rudimentary type of numbers
var PROPERTY_CODE = 0
var SEQUENCE_CODE = 1
var STRING_CODE = 2
var NUMBER_CODE = 3

// these are the starting codes (structures also use this space) for complete types
var METADATA_TYPE = 0
var ARRAY_TYPE = 1
var REFERENCING_TYPE = 2
var NUMBER_TYPE = 3
var DEFAULT_TYPE = 4
var CONTINUED_REFERENCING_TYPE = 5

var BLOCK_SUB_CODE = 14
var BLOCK_LENGTH_SUB_CODE = 15

var NULL = 0
var UNDEFINED = 1
var TRUE = 2
var FALSE = 3

function createSerializer(options) {
	if (!options)
		options = {}
	var maxReferenceableStringLength = options.maxReferenceableStringLength || 2400
	var extendedTypes = options.converterByConstructor
	if (!extendedTypes) {
		extendedTypes = new Map()
	}
	extendedTypes.set(Map, {
		name: 'Map',
		toValue: writeMap
	})
	extendedTypes.set(Set, {
		name: 'Set',
		toValue: writeSet
	})
	extendedTypes.set(Date, {
		name: 'Date',
		toValue: writeDate
	})
	var charEncoder = (typeof global != 'undefined' && global.Buffer) ? exports.nodeCharEncoder(options) : browserCharEncoder(options)
	var writeString = charEncoder.writeString
	var writeToken = charEncoder.writeToken
	var startSequence = charEncoder.startSequence
	var endSequence = charEncoder.endSequence
	var writeBuffer = charEncoder.writeBuffer
	var pendingEncodings = []
	var properties = new Map()
	var nextBlockId = 0
	var nextPropertyIndex = 8
	var property = { index: 0 } // default root property
	var rootProperty = property
	if (options.useImport) {
		//options.useImport
	}

	// write a rudimentary array
	function writeArray(array) {
		var length = array.length
		var arrayProperty = property
		if (length > 10) {
			writeToken(SEQUENCE_CODE, 11) // start sequence [
		} else {
			writeToken(SEQUENCE_CODE, length) // write out the header token
		}
		for (var i = 0; i < length; i++) {
			property.writeValue(array[i])
		}
		if (length > 10) {
			writeToken(SEQUENCE_CODE, 13) // end sequence
		}
		property = arrayProperty
	}
	// write a rudimentary number
	function writeNumber(number) {
		writeToken(NUMBER_CODE, number)
	}
	// write a rudimentary string
	function writeInlineString(string) {
		writeToken(STRING_CODE, string.length)
		writeString(string)
	}

	// writing any value in referencing serialization type mode
	function writeAsReferencing(value) {
		var values = property.values
		if (values) {
			var reference = values.indexOf(value)
			if (reference > -1) {
				return writeNumber(reference + 4)
			} else {
				var index = values.length
				if (index < 12)
					values[index] = value
			}
		}
		var type = typeof value
		if (type === 'string') {
			writeInlineString(value)
		} else {
			writeAsDefault(value)
		}
	}

	// writing any value in number serialization type mode
	function writeAsNumber(number) {
		var type = typeof number
		if (type === 'number') {
			if (number >>> 0 === number || (number > 0 && number < 0x400000000000 && number % 1 === 0)) {
				// 46 bit unsigned integer
				writeToken(NUMBER_CODE, number + 4)
			} else {
				// decimal number serialized as a string
				var asString = number.toString()
				writeInlineString(asString)
			}
		} else if (type === 'boolean') {
			writeToken(NUMBER_CODE, number ? TRUE : FALSE)
		} else if (type === 'object' && number && number.constructor === Array) {
			writeArray(number)
		} else {
			writeTypedValue(number)
		}
	}

	function writeTypedValue(value) {
		if (value === null)
			writeToken(NUMBER_CODE, NULL)
		else if (value === false)
			writeToken(NUMBER_CODE, FALSE)
		else if (value === true)
			writeToken(NUMBER_CODE, TRUE)
		else if (value === undefined)
			writeToken(NUMBER_CODE, UNDEFINED)
		else {
			writeTypedNonConstant(value)
		}
	}

	function writeTypedNonConstant(value) {
		var type = typeof value
		var extendedType
		if (type === 'object') {
			if (value) {
				var constructor = value.constructor
				if (constructor === Object) {
					// leave type as is
				} else if (constructor === Array) {
					type = 'array'
				} else {
					extendedType = extendedTypes.get(constructor)
					if (extendedType && extendedType.toValue) {
						value = extendedType.toValue(value)
						type = typeof value // go through the same logic adjustment here
						if (value && type === 'object' && value.constructor === Array) {
							type = 'array'
						}
						if (property.type === type) {
							// if we are the right type after doing the conversion, go back to the original property to serialize
							if (property.extendedType !== extendedType) {
								property.extendedType = extendedType
								writeToken(PROPERTY_CODE, METADATA_TYPE)
								writeInlineString(extendedType.name)
							}
							return property.writeValue(value)
						}
					} else {
						extendedType = false
					}

				}
			} else { // null
				type = 'undefined' // treat null as same type as undefined, both constants
			}
		} else if (type === 'boolean') {
			type = 'undefined'
		} else if (type === 'function') {
			value = value.toString()
			type = 'string'
		}
		writeProperty(value, null, type, extendedType).writeValue(value)
	}

	function writeOnlyNull() {
		writeToken(NUMBER_CODE, NULL)
	}

	// writing any value in default serialization type mode
	function writeAsDefault(value, parentProperty) {
		var type = typeof value
		if (type === 'object') {
			if (!value) {
				return writeToken(NUMBER_CODE, NULL)
			}
			// else continue with the object code
		} else if (type === 'string') {
			if (parentProperty) {
				return (parentProperty.child = writeProperty(value, null, 'string')).writeValue(value)
			}
			return writeInlineString(value)
		} else if (type === 'number' && (value >>> 0 === value || (value > 0 && value < 0x400000000000 && value % 1 === 0))) {
			// 46 bit unsigned integer
			return writeToken(NUMBER_CODE, value + 4)
		} else {
			return writeTypedValue(value)
		}
		var object = value
		var constructor = object.constructor
		var notPlainObject
		if (constructor === Object) {
			notPlainObject = false
		} else if (constructor === Array) {
			return writeProperty(value, null, 'array').writeValue(value, parentProperty)
		} else {
			if (object.then) {
				return writeProperty(value, null, 'block').writeValue(value)
			}
			if (constructor === serialize.Block) {
				return writeProperty(value, null, 'block').writeValue(value)
			}
			extendedType = extendedTypes.get(constructor)
			if (extendedType) {
				if (extendedType.toValue) {
					return writeTypedValue(object)
				}
			} else {
				extendedTypes.set(constructor, extendedType = {
					name: constructor.name
				})
			}
			if (property.constructs !== constructor) {
				writeToken(PROPERTY_CODE, METADATA_TYPE)
				writeInlineString(extendedType.name)
				property.constructs = constructor
			}
			if (typeof Symbol !== 'undefined' && object[Symbol.iterator]) {
				writeProperty(value, null, 'array')
				writeAsIterable(object)
			}
			notPlainObject = true
		}
		var thisProperty = property
		property = thisProperty.first
		startSequence()
		var i = 0
		for (var key in object) {
			if (notPlainObject && !object.hasOwnProperty(key))
				continue
			var value = object[key]
			type = typeof value
			var constructor
			var extendedType = false
			if (type === 'object') {
				if (value) {
					constructor = value.constructor
					if (constructor === Object) {
						// leave type as is
					} else if (constructor === Array) {
						type = 'array'
					} else if (constructor === serialize.Block) {
						type = 'block'
					} else if (value.then) {
						type = 'block'
					} else {
						extendedType = extendedTypes.get(constructor)
						if (extendedType && extendedType.toValue) {
							value = extendedType.toValue(value)
							type = typeof value // go through the same logic adjustment here
							if (value && type === 'object' && value.constructor === Array) {
								type = 'array'
							}
						} else {
							extendedType = false
						}

					}
				} else { // null
					type = 'undefined' // treat null as same type as undefined, both constants
				}
			} else if (type === 'boolean') {
				type = 'undefined'
			}
			if (!property || property.key !== key ||
					(property.type !== type && type !== 'boolean' && type !== 'undefined' && value !== null) ||
					(extendedType && property.extendedType !== constructor)) {
				property = properties.get(key)
				if (property) {
					if (property.index) {
						if (property.type === type && (!extendedType || property.extendedType === constructor)) { // right type, we can just reference the property
							writeToken(PROPERTY_CODE, property.index)
						} else if (property[type]) {
							property = property[type]
							writeToken(PROPERTY_CODE, property.index)
						} else {
							property = property[type] = writeProperty(value, key, type, extendedType, nextPropertyIndex++)
						}
					} else {
						property = writeProperty(value, key, type, extendedType, nextPropertyIndex++)
						properties.set(key, property)
					}
				} else {
					property = writeProperty(value, key, type, extendedType)
					properties.set(key, true)
				}
				if (previousProperty)
					previousProperty.next = property
				else
					thisProperty.first = property
				/*if (needsStateRecorded) {
					if (property.currentBlock !== currentBlock) {
						structuresToRestore.push(property, structure.slice(0))
						property.currentBlock = currentBlock
						needsStateRecorded = false
					}
				}*/
				// once it is written, update our entries
			}
			property.writeValue(value)
			var previousProperty = property
			property = previousProperty.next
			i++
		}
		if (parentProperty === rootProperty && pendingEncodings.length > 0) {
			// note that we don't change back to the object's property, as the pending encodings should use relative references relative to the last property
			property = previousProperty
			serializer.rootBuffer = Buffer.from([]) // indicate that we need to finish with an end sequence token
			serializer.startSequenceLength = 1
		} else {
			property = thisProperty
			endSequence(i)
		}
	}

	function writeProperty(value, key, type, extendedType, index) {
		if (type === 'block') {
			if (!blockProperty) {
				blockProperty = {
					index: 7,
					type: CONTINUED_REFERENCING_TYPE,
					writeValue: writeAsBlock,
					values: []
				}
			}
			writeToken(PROPERTY_CODE, 7)
			if (nextBlockId === 0 && options.outlet) {
				writeToken(PROPERTY_CODE, REFERENCING_TYPE)
			} else {
				writeToken(PROPERTY_CODE, CONTINUED_REFERENCING_TYPE)
			}
			property = blockProperty
			property.key = key
			property.writeValue = writeAsBlock
			if (typeof key === 'string') {
				writeInlineString(key)
			} else {
				writeAsDefault(key)
			}
			return property
		}
		property = {
			type: type,
			key: key
		}
		if (index) {
			writeToken(PROPERTY_CODE, index)
			property.index = index
		}
		if (type === 'string') {
			writeToken(PROPERTY_CODE, REFERENCING_TYPE)
			property.values = []
			property.writeValue = writeAsReferencing
		} else if (type === 'number') {
			writeToken(PROPERTY_CODE, NUMBER_TYPE)
			property.writeValue = writeAsNumber
		} else if (type === 'object') {
			writeToken(PROPERTY_CODE, DEFAULT_TYPE)
			property.writeValue = writeAsDefault
		} else if (type === 'array') {
			writeToken(PROPERTY_CODE, ARRAY_TYPE)
			property.child = {
				type: 'object',
				key: null,
				index: property.index,
				writeValue: writeAsDefault
			}
			property.writeValue = writeAsArray
		} else if (type === 'boolean' || type === 'undefined') {
			writeToken(PROPERTY_CODE, DEFAULT_TYPE)
			property.writeValue = writeAsDefault
		} else {
			writeToken(PROPERTY_CODE, DEFAULT_TYPE)
			property.writeValue = writeOnlyNull
			console.error('Unable to write value of type ' + type)
		}

		if (typeof key === 'string') {
			writeInlineString(key)
		} else {
			writeAsDefault(key)
		}
		if (extendedType) {
			property.extendedType = extendedType
			writeToken(PROPERTY_CODE, METADATA_TYPE)
			writeInlineString(extendedType.name)
		}
		return property
	}

	function writeAsBlock(value) {
		// once we enter the block property, we must exit to serialize any other type, or we mess up the reference numbers
		if (value && (value.constructor === serialize.Block || value.then)) {
			return writeBlockReference(value)
		}
		return writeTypedValue(value)
	}

	function writeAsIterable(iterable) {
		writeToken(SEQUENCE_CODE, 11)
		var iterator = iterable[Symbol.iterator]()
		var arrayProperty = property
		property = arrayProperty.child || (arrayProperty.child = arrayProperty) // set the current property to the child property
		// write out the elements
		var result
		while(!(result = iterator.next()).done) {
			property.writeValue(result.value, arrayProperty)
		}
		if (property !== arrayProperty.child) {
			// TODO: This really needs to happen immediately when a property changes, to match the parsing behavior
			arrayProperty.child = property
		}
		property = arrayProperty // restore current property
		writeToken(SEQUENCE_CODE, 13) // end sequence
	}

	function writeAsArray(array, parentProperty) {
		if (array && array.constructor === Array) { // check to make sure it is an array
			var length = array.length
			var needsClosing
			if (length > 10 || parentProperty === rootProperty) {
				writeToken(SEQUENCE_CODE, 11) // start sequence [
				needsClosing = true
			} else {
				writeToken(SEQUENCE_CODE, length) // write out the header token
			}
			var arrayProperty = property
			property = arrayProperty.child || (arrayProperty.child = arrayProperty) // set the current property to the child property
			// write out the elements
			for (var i = 0; i < length; i++) {
				property.writeValue(array[i], arrayProperty)
			}
			if (property !== arrayProperty.child) {
				// TODO: This really needs to happen immediately when a property changes, to match the parsing behavior
				arrayProperty.child = property
			}
			if (needsClosing) {
				if (parentProperty === rootProperty && pendingEncodings.length > 0) {
					serializer.rootBuffer = Buffer.from([]) // indicate that we need to finish with an end sequence token
					serializer.startSequenceLength = 3
					return
				}
				else
					writeToken(SEQUENCE_CODE, 13) // end sequence
			}
			property = arrayProperty // restore current property
		} else { // bail to default mode behavior
			writeTypedValue(array)
		}
	}



	function writeBlock(value) {
		var parentProperties = properties
		var parentProperty = property
		var parentBlockProperty = blockProperty

		var parentPropertyIndex = nextPropertyIndex
		var parentNextBlockId = nextBlockId
		var parentRootProperty = rootProperty
		nextPropertyIndex = 8
		properties = new Map()
		rootProperty = property = { index: 0 } // new root property
		blockProperty = null
		nextBlockId = 0
		writeToken(SEQUENCE_CODE, BLOCK_SUB_CODE)
		writeBuffer(serialize(value))
		properties = parentProperties
		nextPropertyIndex = parentPropertyIndex
		property = parentProperty
		rootProperty = parentRootProperty
		nextBlockId = parentNextBlockId
		blockProperty = parentBlockProperty
	}

	function getRelativeReference(id) {
		var relativeIndex = id - property.index
		return relativeIndex >= 0 ? (relativeIndex << 1) + 8 : ((-relativeIndex << 1) + 7)
	}

	function writePromise(promise) { // in object mode
		var id = nextBlockId++
		if (id === 0 && options.outlet) {
			writeToken(PROPERTY_CODE, 7)
			writeToken(PROPERTY_CODE, REFERENCING_TYPE)
			writeToken(NUMBER_CODE, UNDEFINED)
			writeToken(NUMBER_CODE, UNDEFINED)
		}
		writeToken(PROPERTY_CODE, 7)
		writeToken(NUMBER_CODE, id + 4) // should be in object mode
		var lazyPromise = {
			then: function(callback) {
				return promise.then(function(value) {
/*					if (inLazyDocument) {
						var valueBuffer = writeOpen(value)
						writeToken(0, 13)
						writeFixed(length)
						writeToken(0, 14)
						writeFixed(id)
						writeBuffer(valueBuffer)
					} else
					*/

					var startOffset = charEncoder.getOffset()
					var buffer = value && value[bufferSymbol]
					if (id === 1 && !options.outlet) {
						writeToken(PROPERTY_CODE, 7)
						writeToken(PROPERTY_CODE, REFERENCING_TYPE)
						writeToken(NUMBER_CODE, UNDEFINED)
						writeToken(NUMBER_CODE, UNDEFINED)
					}
					writeToken(PROPERTY_CODE, 7)
					if (buffer) { // block array
						writeToken(SEQUENCE_CODE, buffer.length + 16) // indicate it is a block
						writeBuffer(buffer)
					} else {
						writeBlock(value) // write it as a block
					}
				}, function(error) {
					writeToken(SEQUENCE_CODE, id)
					writeBlock({ error: error.message }) // write it as a block
				}).then(callback)
			}
		}
		pendingEncodings.push(lazyPromise)
	}

	var blockProperty


	function writeBlockReference(block, writer) {
		var id = nextBlockId++
		if (!blockProperty) {
			blockProperty = {
				index: 7,
				writeValue: writeAsBlock
			}
		}
		writeToken(NUMBER_CODE, id + 4) // should be in object mode
		var lazyPromise = block.constructor === serialize.Block ? {
			then: then
		} : {
			then: function(callback) {
				return block.then(function(value) {
					block = value
					then(callback)
				})
			}
		}
		function then(callback) {
			var startOffset = charEncoder.getOffset()
			var buffer = block[bufferSymbol]
			writeToken(PROPERTY_CODE, 7)
			if (id === 0) {
				if (options.outlet) {
					writeToken(PROPERTY_CODE, CONTINUED_REFERENCING_TYPE)
				} else {
					writeToken(PROPERTY_CODE, REFERENCING_TYPE)
				}
				writeToken(NUMBER_CODE, UNDEFINED)
			}
			if (buffer) { // block array
				writeToken(SEQUENCE_CODE, buffer.length + 16) // indicate it is a block with length
				writeBuffer(buffer)
			} else {
				writeBlock(block) // write it as a block
			}
			callback()
		}
		pendingEncodings.push(lazyPromise)
	}

	var serializer = {
		serialize: function(value) {
			var buffer = value && value[bufferSymbol]
			if (buffer) {
				charEncoder.writeBuffer(buffer)
				return
			}
			var startingOffset = charEncoder.getOffset()
			if (options && options.asBlock) {
				startingOffset += 1
				writeBlock(value)
			} else {
				writeAsDefault(value, rootProperty)
			}
			if (pendingEncodings.length > 0) {
				if (options.outlet) {
					// if we have an outlet, we write the main content first, and then do the remaining blocks
					// but that should already happen naturally
					this.rootBuffer = Buffer.from([]) // just include a rootBuffer to indicate that a sequence close token is needed
				} else {
					// if there are other blocks (and no outlet) the content is deferred to go at the end, so length-defined blocks can be read first and lazily parsed
					var endOfBlock = charEncoder.getOffset()
					var blockBufferLength = endOfBlock - startingOffset
					var rootBuffer = charEncoder.getSerialized()
					startingOffset += this.startSequenceLength || 1
					this.rootBuffer = Buffer.from(rootBuffer.slice(startingOffset)) // TODO: only if in object do we increment
					charEncoder.setOffset(startingOffset)
					// this is a rather tricky technique, but as long as the assumption hold true, is an elegant way to handle inserting these references,
					// we are creating blocks for each pending encoding, and so we reset the next property index to before the start of the last block,
					// and let each block get its natural index
				}
			}
		},
		getSerialized: function() {
			if (pendingEncodings.length > 0) {
				var promises = []
				while (pendingEncodings.length > 0) {
					var finished = false
					var promise = pendingEncodings.shift().then(function() {
						finished = true
					})
					if (!finished) {
						promises.push(promise)
					}
				}
				if (promises.length > 0) {
					return Promise.all(promises).then(function() {
						return serializer.getSerialized()
					})
				}
			}
			if (this.rootBuffer) {
				charEncoder.writeBuffer(this.rootBuffer)
				this.rootBuffer = null
				writeToken(SEQUENCE_CODE, 13) // close sequence to end it
			}
			return charEncoder.getSerialized()
		},
		flush: charEncoder.flush,
		pendingEncodings: pendingEncodings
	}
	return serializer
}
function serialize(value, options) {
	var serializer = createSerializer(options)
	serializer.serialize(value)
	return serializer.getSerialized()
}
exports.serialize = serialize
exports.createSerializer = createSerializer

function browserCharEncoder() {
	var serialized = ''
	function writeToken(type, number) {
		var serializedToken
		if (number < 0x10) { // 4 bits of number
			serializedToken = String.fromCharCode((type << 4) + number + 0x40)
		} else if (number < 0x400) { // 10 bits of number
			serializedToken = String.fromCharCode(
				(type << 4) + (number >>> 6),
				(number & 0x3f) + 0x40)
		} else if (number < 0x10000) { // 16 bits of number
			serializedToken = String.fromCharCode(
				(type << 4) + (number >>> 12),
				(number >>> 6) & 0x3f,
				(number & 0x3f) + 0x40)
		} else if (number < 0x400000) { // 22 bits of number
			serializedToken = String.fromCharCode(
				(type << 4) + (number >>> 18),
				(number >>> 12) & 0x3f,
				(number >>> 6) & 0x3f,
				(number & 0x3f) + 0x40)
		} else if (number < 0x10000000) { // 28 bits of number
			serializedToken = String.fromCharCode(
				(type << 4) + (number >>> 24),
				(number >>> 18) & 0x3f,
				(number >>> 12) & 0x3f,
				(number >>> 6) & 0x3f,
				(number & 0x3f) + 0x40)
		} else if (number < 0x100000000) { // 32 bits of number
			serializedToken = String.fromCharCode(
				(type << 4) + (number >>> 30),
				(number >>> 24) & 0x3f,
				(number >>> 18) & 0x3f,
				(number >>> 12) & 0x3f,
				(number >>> 6) & 0x3f,
				(number & 0x3f) + 0x40)
		} else if (number < 0x400000000) { // 34 bits of number
			serializedToken = String.fromCharCode(
				(type << 4) + (number / 0x40000000 >>> 0),
				(number >>> 24) & 0x3f,
				(number >>> 18) & 0x3f,
				(number >>> 12) & 0x3f,
				(number >>> 6) & 0x3f,
				(number & 0x3f) + 0x40)
		} else if (number < 0x10000000000) { // 40 bits of number
			serializedToken = String.fromCharCode(
				(type << 4) + (number / 0x1000000000 >>> 0),
				(number / 0x40000000) & 0x3f,
				(number >>> 24) & 0x3f,
				(number >>> 18) & 0x3f,
				(number >>> 12) & 0x3f,
				(number >>> 6) & 0x3f,
				(number & 0x3f) + 0x40)
		} else if (number < 0x400000000000) { // 46 bits of number (needed for dates!)
			serializedToken = String.fromCharCode(
				(type << 4) + (number / 0x40000000000 >>> 0),
				(number / 0x1000000000) & 0x3f,
				(number / 0x40000000) & 0x3f,
				(number >>> 24) & 0x3f,
				(number >>> 18) & 0x3f,
				(number >>> 12) & 0x3f,
				(number >>> 6) & 0x3f,
				(number & 0x3f) + 0x40)
		} else {
			throw new Error('Too big of number')
		}
		serialized += serializedToken
	}
	function writeString(string) {
		serialized += string
	}
	function getSerialized() {
		return serialized
	}
	return {
		writeToken: writeToken,
		writeString: writeString,
		//writeBuffer,
		getSerialized: getSerialized,
		//insertBuffer,
		//flush,
		startSequence: function() {
			writeToken(SEQUENCE_CODE, 11)
		},
		endSequence: function() {
			writeToken(SEQUENCE_CODE, 13)
		},
		getOffset: function() {// unsupported
			return -1
		}
	}
}
var ArrayFrom = Array.from || function(iterable, keyValue) {
	var array = []
	var keyValue = iterable.constructor === Map
	iterable.forEach(function(key, value) {
		if (keyValue) {
			array.push([value, key])
		} else {
			array.push(key)
		}
	})
	return array
}

function writeMap(map) {
	var keyValues = ArrayFrom(map)
	for (var i = 0, length = keyValues.length; i < length; i++) {
		var keyValue = keyValues[i]
		keyValues[i] = {
			key: keyValue[0],
			value: keyValue[1]
		}
	}
	return keyValues
}
function writeSet(set) {
	return ArrayFrom(set)
}
function writeDate(date) {
	return date.getTime()
}



var bufferSymbol = __webpack_require__(/*! ./Block */ "./lib/Block.js").bufferSymbol
var headerSymbol = __webpack_require__(/*! ./Block */ "./lib/Block.js").headerSymbol
var parsedSymbol = __webpack_require__(/*! ./Block */ "./lib/Block.js").parsedSymbol

/* WEBPACK VAR INJECTION */}.call(this, __webpack_require__(/*! ./../node_modules/webpack/buildin/global.js */ "./node_modules/webpack/buildin/global.js")))

/***/ }),

/***/ "./node_modules/webpack/buildin/global.js":
/*!***********************************!*\
  !*** (webpack)/buildin/global.js ***!
  \***********************************/
/*! no static exports found */
/***/ (function(module, exports) {

var g;

// This works in non-strict mode
g = (function() {
	return this;
})();

try {
	// This works if eval is allowed (see CSP)
	g = g || Function("return this")() || (1, eval)("this");
} catch (e) {
	// This works if the window reference is available
	if (typeof window === "object") g = window;
}

// g can still be undefined, but nothing to do about it...
// We return undefined, instead of nothing here, so it's
// easier to handle this case. if(!global) { ...}

module.exports = g;


/***/ }),

/***/ "./xhr.js":
/*!****************!*\
  !*** ./xhr.js ***!
  \****************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var createParser = __webpack_require__(/*! ./lib/parse */ "./lib/parse.js").createParser

exports.XMLHttpRequest = function() {
	var xhr = new XMLHttpRequest()
	var parser
	var responseResolve
	var responseRejected
   	var requestResolved
	xhr.addEventListener('progress', receivedData)
	var acceptSet
	var originalSetRequestHeader = xhr.setRequestHeader
	var lastOffset = 0
	xhr.setRequestHeader = function(name, value) {
		if (name.toLowerCase() == 'accept')
			acceptSet = true
		return originalSetRequestHeader.call(this, name, value)
	}
	var originalSend = xhr.send
	xhr.send = function() {
		if (!acceptSet)
			this.setRequestHeader('Accept', 'text/dpack;q=1,application/json;q=0.7')
		originalSend.apply(this, arguments)
	}

	function receivedData(event) {
		var sourceText = xhr.responseText
//		try {
			if (parser) {
				if (parser.onResume) {
					var updatedData = parser.onResume(sourceText.slice(lastOffset), true, true)
					xhr.responseParsed = xhr.responseParsed || updatedData
				}
			} else {
				if (sourceText && /dpack/.test(xhr.getResponseHeader('Content-Type'))) {
					parser = createParser()
					parser.setSource(sourceText, 0, true)
					xhr.responseParsed = parser.read()
				}
				else
					return
			}
			lastOffset = sourceText.length
/*		} catch (error) {
			if (xhr.onerror) {
				xhr.onerror(error)
			} else {
				throw error
			}
		}*/
	}
	xhr.addEventListener('load', function(event) {
		receivedData()
		if (parser && parser.isPaused()) {
			throw new Error('Unexpected end of dpack stream')
		}
	})
	return xhr
}


/***/ })

/******/ });
});
//# sourceMappingURL=index.js.map