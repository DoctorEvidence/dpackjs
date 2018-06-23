/*
This introduces a new msgpack extension type Document, of the following format:
0x10, length, document-data

document-data = properties, structures, document-object-structure

properties = Array<string|<string|type>>
structures = Array<structure>
structure = Array<number(property-index)>
type = 0x80 - object (will read values in document-object-structure) | array of enum of values(values are indexes into enum) | any-non-string-primitive-value (missing type indicates standard msgpack encoding of values)

document-object-structure is same msgpack format except for an additional object formats:
object-ref-structure: object-token(structure-index, which will determine # of properties), ...values
object-own-structure: 0xc1 object-token(length of structure), structure, ...values

0x11 is same format as Document, except it inherits and adds to current structure list for parsing.
*/


const msgpack = require('msgpack-lite')
const documentPacker = require('./lib/write-doc').documentPacker
const documentUnpackerLazy = require('./lib/read-doc').documentUnpackerLazy
const EncodeStream = require('./lib/encode-stream').EncodeStream

const Document = exports.Document = require('./lib/Document').Document
exports.makeDocument = require('./lib/Document').makeDocument


function ObjectReference() {}
function DocumentReferences(object, Type) {
	this.object = object
	this.Type = Type
	this.structureMap = new Map()
	this.declaredStructures = []
}

const UNDEFINED = -23 // special marker for undefined slots that only uses one byte

function createCodec() {
	var codec = msgpack.createCodec()
	codec.addExtPacker(0x10, Document, documentPacker)
	codec.addExtUnpacker(0x10, documentUnpackerLazy)
	return codec
}
var codec = createCodec()
exports.codec = codec
var DEFAULT_OPTIONS = { codec: codec }
exports.createCodec = createCodec
exports.encode = (value, options) => {
	if (options) {
		if (!options.codec) {
			options.codec = codec
		}
	} else {
		options = DEFAULT_OPTIONS
	}
	return msgpack.encode(value, options)
}

exports.decode = (value, options) => {
	if (options) {
		if (!options.codec) {
			options.codec = codec
		}
	} else {
		options = DEFAULT_OPTIONS
	}
	return msgpack.decode(value, options)
}

exports.createEncodeStream = function() {

}
