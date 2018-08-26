function findCommonStructures(values) {
	var allStructures = new Map()
	for (var i = 0; i < values.length; i++) {
		var serializer = createSerializer({
			readBlocks: true
		})
		serializer.writeOpen(values[i])
		var structures = serializer.getStructures()
		for (var structure of structures) {
			var structureKey = ''
			for (var property of structure) {
				structureKey += property.key + '-' + property.type
			}
			var existingStructure = allStructures.get(structureKey)
			if (existingStructure)
				existingStructure.count = (existingStructure.count || 1) + 1
			else
				allStructures.put(structureKey, existingStructure = structure)
			// TODO: add values
		}
	}
	var commonObjects = []
	for (var [ key, structure ] of structures) {
		if (structure.count > 1) {
			var commonObject = {}
			for (var property of structure) {
				var value
				if (property.type === 'string') {
					value = property.values || ''
				} else if (property.type == 'number') {
					value = 0
				} else if (property.type === 'object') {
					value = null
				}
				commonObject[property.name] = value
			}
			commonObjects.push(commonObject)
		}
	}
	return commonObjects
}
exports.findCommonStructures = findCommonStructures
