/*
This introduces a new msgpack extension type Document, of the following format:
0x10, length, document-data

document-data = settings, properties, structures, document-object-structure

properties = Array<string|<string|type>>
structures = Array<structure>
structure = Array<number(property-index)>
type = 0x80 - object (will read values in document-object-structure) | array of enum of values(values are indexes into enum) | any-non-string-primitive-value (missing type indicates standard msgpack encoding of values)

document-object-structure is same msgpack format except for an additional object formats:
object-ref-structure: number(structure-index, which will determine # of properties), ...values
object-own-structure: structure(except using object type bytes), ...values


0x11 is same format as Document, except it inherits and adds to current structure list for parsing.
*/


const msgpack = require('msgpack-lite')

const documentSymbol = Symbol('document')

exports.makeDocument = (object, Type) => {
  // TODO: Create a proxy here, but in the meantime just mark it
  Object.defineProperty(object, 'constructor', { value: Document, configurable: true })
  return object
}

function Document() {
}

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
  codec.addExtUnpacker(0x10, documentUnpacker)
  codec.addExtPacker(0x11, ObjectReference, referencePacker)
  codec.addExtUnpacker(0x11, referenceUnpacker)
  return codec
}
var codec = createCodec()
exports.codec = codec
var DEFAULT_OPTIONS = { codec: codec }
exports.createCodec = createCodec
function referencePacker(reference) {
  const parts = [reference.id]
  const object = reference.object
  const nonTemplateValues = reference.nonTemplateValues
  if (nonTemplateValues) {
    parts.push.apply(parts, nonTemplateValues)
  } else {
    for (const key in object)
      parts.push(object[key])
  }
  return msgpack.encode(parts)
}
var currentDocumentReferences
function referenceUnpacker(buffer) {
  var parts = msgpack.decode(buffer)
  var referenceIndex = parts[0]
  var structure = currentDocumentReferences.declaredStructures[referenceIndex]
  var template
  if (typeof structure[0] === 'number') {
    template = structure
    structure = currentDocumentReferences.declaredStructures[template[0]]
  }

  var keyIndex = 1
  var object = {}
  for (var i = 0, l = structure.length; i < l;) {
    var key = structure[i++]
    // use the template
    object[key] = template && template[i] !== UNDEFINED ? template[i] : parts[keyIndex++]
  }
  // TODO: If there is another value in the array, could be an object with additional properties
  return object
}
let objectId = 1
const baseEncode = codec.encode
codec.encode = function(encoder, value) {
  if (value && value.constructor === Object) {
    if (currentDocumentReferences) {
      const structureMap = currentDocumentReferences.structureMap
      var propertyStructure = []
      var templateStructure = []
      var nonTemplateValues = []
      var hasTemplatableValues = false
      for (var key in value) {
        propertyStructure.push(key)
        const subValue = value[key]
        if (!subValue || subValue === true) {
          // record null, 0, false, true, '' into template
          hasTemplatableValues = true
          templateStructure.push(subValue)
        } else {
          templateStructure.push(UNDEFINED)
          nonTemplateValues.push(subValue)
        }
      }
      const structureKey = propertyStructure.join('|')
      var referenceIndex = structureMap.get(structureKey)
      if (referenceIndex === undefined) {
        structureMap.set(structureKey, -1)
      } else {
        if (referenceIndex === -1) {
          referenceIndex = currentDocumentReferences.declaredStructures.push(propertyStructure) - 1
          structureMap.set(structureKey, referenceIndex)
        } else if (hasTemplatableValues) {
          var templateKey = templateStructure.join('|')
          var templateIndex = templateMap.get(templateKey)
          if (templateIndex === undefined) {
            templateMap.set(templateKey, -1)
          } else {
            if (templateIndex === -1) {
              templateStructure.shift(referenceIndex)
              templateIndex = currentDocumentReferences.declaredStructures.push(templateStructure) - 1
            }
            referenceIndex = templateIndex
          }
        }
        const reference = new ObjectReference()
        reference.id = referenceIndex
        reference.object = value
        if (templateIndex) {
          reference.nonTemplateValues = nonTemplateValues
        }
        return baseEncode(encoder, reference)
      }
    }
  }
  return baseEncode(encoder, value)
}
function documentPacker(object) {
  const document = object[documentSymbol]
  if (document instanceof Buffer)
    return document
  const previousDocumentReferences = currentDocumentReferences
  var encodedData
  var documentReferences
  try {
    Object.defineProperty(object, 'constructor', { value: Object, configurable: true }) // hack, probably use a proxy instead
    documentReferences = currentDocumentReferences = new DocumentReferences(object/*, documentType*/)
    encodedData = msgpack.encode(object, DEFAULT_OPTIONS)
  } finally {
    Object.defineProperty(object, 'constructor', { value: Document, configurable: true })
    currentDocumentReferences = previousDocumentReferences
  }
  var documentArray = documentReferences.declaredStructures.concat([encodedData])
  return msgpack.encode(documentArray)

}
function documentUnpacker(buffer) {
  return new Proxy({ buffer: buffer }, unpackOnDemand)
}
const unpackOnDemand = {
  get(target, key) {
    var decoded = target.decodedMsgPack
    if (!decoded) {
      if (key == 'constructor')
        return new Document(target)
      decoded = unpackOnDemand.getDecoded(target)
    }
    return decoded[key]
  },
  set(target, key, value) {

  },
  getOwnPropertyDescriptor(target, key) {
    var decoded = unpackOnDemand.getDecoded(target)
    return Object.getOwnPropertyDescriptor(decoded, key)
  },
  has(target, key) {
    var decoded = unpackOnDemand.getDecoded(target)
    return key in decoded
  },
  getDecoded(target) {
    var decoded = target.decodedMsgPack
    if (decoded)
      return decoded
    var structure = msgpack.decode(target.buffer, DEFAULT_OPTIONS)
    var previousDocumentReferences = currentDocumentReferences
    currentDocumentReferences = {
      declaredStructures: structure
    }
    try {
      target.decodedMsgPack = decoded = msgpack.decode(structure[structure.length - 1], DEFAULT_OPTIONS)
    } finally {
      currentDocumentReferences = previousDocumentReferences
    }
//    Object.defineProperty(decoded, documentSymbol, { value: buffer })
    return decoded
  },
  ownKeys(target) {
    var decoded = unpackOnDemand.getDecoded(target)
    return Object.keys(decoded)
  }
}
exports.codec = codec

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
