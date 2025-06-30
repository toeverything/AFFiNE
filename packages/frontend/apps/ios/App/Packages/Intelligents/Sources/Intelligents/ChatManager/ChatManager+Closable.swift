//
//  ChatManager+Closable.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/30/25.
//

import EventSource
import Foundation

protocol Closable { func close() }

extension EventSource: @preconcurrency Closable {}
