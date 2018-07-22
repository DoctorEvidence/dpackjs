"use strict"
function Options() {
	var writerByConstructor = this.writerByConstructor = new Map()
	var classByName = this.classByName = new Map()
	//writerByConstructor.set(Map, writeMap)
	//writerByConstructor.set(Set, writeSet)
}
Options.prototype.addExtension = function(Class, options) {
	options = options || {}
	this.writerByConstructor.set(Class, options.write || function(serializer) {
		return function(instance) {
			serializer.writeObject(instance)
		}
	})
	this.classByName.set(Class.name, options.read || function(parser) {
		return function() {
			var instance = Object.create(Class.prototype)
			Object.assign(instance, parser.readObject())
			return instance
		}
	})
}
exports.Options = Options
