//
//  MomentsLimits.swift
//  Pantopus
//
//  What a Moment's video may be, as the server last said (`GET
//  /api/moments/limits`): 60 seconds a Moment, a longer video posted as up to
//  five Moments in a row, and the largest file an upload may be, which the
//  video is sized to. Kept on the phone, so the camera and the library know
//  before the server answers again; until it has ever answered, 30 seconds
//  and one Moment, which every server takes.
//

import Foundation
import os

enum MomentsLimits {
    private static let key = "pantopus.moments.videoLimits"
    private static let box = OSAllocatedUnfairLock<MomentVideoLimitsDTO>(initialState: saved())

    static var video: MomentVideoLimitsDTO {
        box.withLock { $0 }
    }

    /// The longest video that can be posted at all, as its parts.
    static var longestVideoSeconds: Double {
        let limits = video
        return limits.maxSeconds * Double(limits.maxParts)
    }

    /// "Videos can be up to 5 minutes."
    static var tooLongMessage: String {
        let longest = longestVideoSeconds
        if longest >= 120 { return "Videos can be up to \(Int(longest / 60)) minutes." }
        return "Videos can be up to \(Int(longest)) seconds."
    }

    /// Asks the server; what it says stays until it says otherwise. Nothing changes when it can't be reached.
    @MainActor
    static func refresh() async {
        guard let reply: MomentLimitsDTO = try? await MomentsAPI.send(MomentsEndpoints.limits) else { return }
        let limits = sane(reply.video)
        box.withLock { $0 = limits }
        if let data = try? JSONEncoder().encode(limits) { UserDefaults.standard.set(data, forKey: key) }
    }

    private static func saved() -> MomentVideoLimitsDTO {
        guard let data = UserDefaults.standard.data(forKey: key),
              let limits = try? JSONDecoder().decode(MomentVideoLimitsDTO.self, from: data) else { return MomentVideoLimitsDTO() }
        return sane(limits)
    }

    /// Numbers a video can be made to: a wrong answer never stops posting.
    private static func sane(_ limits: MomentVideoLimitsDTO) -> MomentVideoLimitsDTO {
        MomentVideoLimitsDTO(
            maxSeconds: min(max(limits.maxSeconds, 10), 120),
            maxParts: min(max(limits.maxParts, 1), 10),
            maxBytes: max(limits.maxBytes, 5 * 1024 * 1024)
        )
    }
}
