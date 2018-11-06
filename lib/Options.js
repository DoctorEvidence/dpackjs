"use strict"
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
