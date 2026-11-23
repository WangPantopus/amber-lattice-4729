//
//  AppAttestProof.swift
//  Pantopus
//
//  App Attest for the location check (FASTVERIFY phase 5): it binds a reading
//  to a real copy of the app on a real iPhone, so nobody can post a home's
//  coordinates and pass. The server's contract (rig README, phase 5): a fresh
//  key and attestation for each check (a check happens a few times a year),
//  with clientDataHash = SHA-256 of the UTF-8 bytes of `challenge + reading`,
//  where `reading` is the exact JSON text of the reading the body also sends.
//
//  A simulator can't attest (`isSupported` is false): no proof is sent, and
//  only a local rig with `FAST_CHECK_LOCATION_TRUST_CLIENT=1` counts the check.
//

import CryptoKit
import DeviceCheck
import Foundation

struct AppAttestProofDTO: Encodable {
    let type = "app_attest"
    let keyId: String
    /// The attestation object, base64.
    let attestation: String
    /// The reading's JSON text, exactly as hashed.
    let reading: String

    private enum CodingKeys: String, CodingKey {
        case type
        case keyId = "key_id"
        case attestation, reading
    }
}

@MainActor
enum AppAttestProof {
    /// The proof for one reading, or nil when this device can't make one (a simulator, an old device, Apple's
    /// servers away for now).
    static func make(challenge: String, reading: String) async -> AppAttestProofDTO? {
        let service = DCAppAttestService.shared
        guard service.isSupported else { return nil }
        let hash = Data(SHA256.hash(data: Data((challenge + reading).utf8)))
        do {
            let keyId = try await service.generateKey()
            let attestation = try await service.attestKey(keyId, clientDataHash: hash)
            return AppAttestProofDTO(keyId: keyId, attestation: attestation.base64EncodedString(), reading: reading)
        } catch {
            return nil
        }
    }
}
