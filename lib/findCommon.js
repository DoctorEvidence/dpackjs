function findCommonStructures(values) {
	var properties = new Map()
	var rootProperty
	function recordObject(object) {
		var constructor = object.constructor
		var notPlainObject
		if (constructor === Object) {
			notPlainObject = false
		} else if (constructor === Array) {
			return writeTypedValue(object)
		} else {
			if (object.then) {
				return
			}
			if (constructor === serialize.Block) {
				return
			}
			extendedType = extendedTypes.get(constructor)
			if (extendedType) {
				if (extendedType.toValue) {
					return writeTypedValue(object)
				}
			} else {
				extendedTypes.set(constructor, {
					name: constructor.name
				})
			}
			if (property.constructs !== constructor) {
				writeToken(PROPERTY_CODE, METADATA_TYPE)
				writeInlineString(extendedType.name)
				property.constructs = constructor
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
			var property = properties.get(key)
		}

	}
	var commonStructure = {}
	createStructure(structure, property) {
		structure[property.key] = null
		while (property = property.next) {
			structure[property.key] = null
		}
	}
	createStructure(commonStructure, rootProperty)
	return commonStructure
}
exports.findCommonStructures = findCommonStructures
