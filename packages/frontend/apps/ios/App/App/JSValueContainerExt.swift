//
//  JSValueContainerExt.swift
//  App
//
//  Created by EYHN on 2025/1/2.
//
import Capacitor

enum RequestParamError: Error {
  case request(key: String)
}

public extension JSValueContainer {
  func getStringEnsure(_ key: String) throws -> String {
    guard let str = getString(key) else {
      throw RequestParamError.request(key: key)
    }
    return str
  }

  func getIntEnsure(_ key: String) throws -> Int {
    guard let int = getInt(key) else {
      throw RequestParamError.request(key: key)
    }
    return int
  }

  func getDoubleEnsure(_ key: String) throws -> Double {
    guard let doub = getDouble(key) else {
      throw RequestParamError.request(key: key)
    }
    return doub
  }

  func getBoolEnsure(_ key: String) throws -> Bool {
    guard let bool = getBool(key) else {
      throw RequestParamError.request(key: key)
    }
    return bool
  }

  func getArrayEnsure(_ key: String) throws -> JSArray {
    guard let arr = getArray(key) else {
      throw RequestParamError.request(key: key)
    }
    return arr
  }

  func getArrayEnsure<T>(_ key: String, _ ofType: T.Type) throws -> [T] {
    guard let arr = getArray(key, ofType) else {
      throw RequestParamError.request(key: key)
    }
    return arr
  }
}
