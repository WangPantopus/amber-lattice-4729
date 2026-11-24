//
//  HomeRecordFixtures.swift
//  Pantopus
//
//  The contract's sample answers (`Preview Content/HomeRecord`), for previews
//  and Debug runs only: Preview Content is a development asset, left out of
//  App Store builds. A Debug launch with `PANTOPUS_HOME_RECORD_FIXTURE` set to
//  `lookup`, `member` or `owner` draws that sample instead of asking the server.
//

#if DEBUG

import Foundation

enum HomeRecordFixtures {
    enum Sample: String {
        case lookup, member, owner
    }

    /// The sample a Debug launch asked for, if any.
    static func requested(for source: HomeRecordSource) -> HomeRecord? {
        guard let raw = ProcessInfo.processInfo.environment["PANTOPUS_HOME_RECORD_FIXTURE"],
              let sample = Sample(rawValue: raw) else { return nil }
        return record(sample, source: source)
    }

    /// A sample answer. `member` is the lookup sample with the person's own
    /// next step on the button, as the contract describes it.
    static func record(_ sample: Sample, source: HomeRecordSource? = nil) -> HomeRecord? {
        let file = sample == .owner ? "home-record-owner" : "home-record-lookup"
        guard let url = Bundle.main.url(forResource: file, withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return nil }
        guard sample == .member else { return try? JSONDecoder().decode(HomeRecord.self, from: data) }
        guard var root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              var blocks = root["blocks"] as? [[String: Any]] else { return nil }
        let homeId = if case let .home(id) = source { id } else { "sample" }
        root["state"] = "member"
        for index in blocks.indices where blocks[index]["kind"] as? String == "promise" {
            blocks[index]["button"] = ["label": "Verify you own this home", "url": "/homes/\(homeId)/claim-owner"]
            blocks[index]["alt"] = [
                "lead": "Renting, or living here with family?",
                "label": "Verify your address",
                "url": "/homes/\(homeId)/verify-residency"
            ]
        }
        root["blocks"] = blocks
        guard let edited = try? JSONSerialization.data(withJSONObject: root) else { return nil }
        return try? JSONDecoder().decode(HomeRecord.self, from: edited)
    }
}

#endif
