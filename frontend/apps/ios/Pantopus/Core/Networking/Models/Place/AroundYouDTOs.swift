//
//  AroundYouDTOs.swift
//  Pantopus
//
//  Today's second half, "Around you": local headlines for the place Today
//  shows. Each item is an outlet's own headline, the outlet's name and a link
//  to the story at the outlet (`backend/services/aroundYouService.js`).
//

import Foundation

/// The Around you page. `available` false: Today shows no switch (the
/// feature is off, or the area has nothing to show).
public struct AroundYouDTO: Decodable, Sendable, Hashable {
    public let available: Bool
    /// The content region's name ("Clark County, WA").
    public let area: String?
    public let sections: [AroundYouSectionDTO]
}

public struct AroundYouSectionDTO: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let title: String
    public let items: [AroundYouItemDTO]
}

public struct AroundYouItemDTO: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let title: String
    /// Who published it ("The Columbian").
    public let source: String?
    /// The story at its outlet; nil for a tip that is its own text.
    public let url: String?
    /// When Pantopus first saw it (ISO 8601).
    public let seenAt: String

    enum CodingKeys: String, CodingKey {
        case id, title, source, url
        case seenAt = "seen_at"
    }
}
