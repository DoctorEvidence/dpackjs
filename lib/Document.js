const bufferSymbol = Symbol('document')

exports.makeDocument = (object, Type) => {
	// TODO: Create a proxy here, but in the meantime just mark it
	Object.defineProperty(object, 'constructor', { value: Document, configurable: true })
	return object
}

function Document() {
}
exports.Document = Document
