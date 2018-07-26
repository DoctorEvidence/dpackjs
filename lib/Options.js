"use strict"
function Options() {
	var converterByConstructor = this.converterByConstructor = new Map()
	var classByName = this.classByName = new Map()
	//writerByConstructor.set(Map, writeMap)
	//writerByConstructor.set(Set, writeSet)
}
Options.prototype.addExtension = function(Class, options) {
	options = options || {}
	var writer = options.write
	if (!writer) {
		writer = function(instance) {
			return instance
		}
		writer.asType = 'object'
	}
	this.converterByConstructor.set(Class, writer)
	this.classByName.set(Class.name, options.read || function(parsedValue) {
		var instance = Object.create(Class.prototype)
		Object.assign(instance, parsedValue)
		return instance
	})
}
exports.Options = Options
