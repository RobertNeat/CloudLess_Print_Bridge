import type { AppConfig } from '../../config/app-config';
import { FilamentCatalogService } from '../../filaments/filament-catalog.service';
import { BambuLabA1CommandProfile } from './bambu-lab-a1-command.profile';

describe('BambuLabA1CommandProfile', () => {
  const config = {
    filaments: { catalogPath: undefined, catalogMode: 'replace' },
    filamentSystem: { amsUnitCount: 1, slotsPerUnit: 4, externalSpool: true },
  } as AppConfig;
  const createProfile = () =>
    new BambuLabA1CommandProfile(config, new FilamentCatalogService(config));

  describe('getMachineEnvelope', () => {
    it('exposes the documented A1 safe travel range', () => {
      expect(createProfile().getMachineEnvelope()).toEqual({
        x: { minimum: 0, maximum: 256 },
        y: { minimum: 0, maximum: 256 },
        z: { minimum: 20, maximum: 240 },
      });
    });
  });

  describe('getHeaterCapabilities', () => {
    it('reports no chamber heater, matching the real A1 hardware', () => {
      expect(createProfile().getHeaterCapabilities()).toEqual({
        hasChamberHeater: false,
      });
    });
  });

  describe('inspectPayload', () => {
    it('accepts a payload with no gcode to inspect', () => {
      const profile = createProfile();

      expect(
        profile.inspectPayload({ print: { command: 'pause', param: '' } }),
      ).toEqual({ safe: true });
    });

    it('accepts an in-bounds absolute move and reports the target', () => {
      const profile = createProfile();

      expect(
        profile.inspectPayload({
          print: {
            command: 'gcode_line',
            param: 'G90\nG1 X125 Y125 Z20 F3000\n',
          },
        }),
      ).toEqual({ safe: true, targetPosition: { x: 125, y: 125, z: 20 } });
    });

    it('rejects a hand-crafted gcode payload that exceeds the Z maximum', () => {
      const profile = createProfile();

      const result = profile.inspectPayload({
        print: { command: 'gcode_line', param: 'G90\nG1 Z500 F3000\n' },
      });

      expect(result.safe).toBe(false);
      expect(result.reason).toContain('Z target 500');
      expect(result.reason).toContain('20..240');
    });

    it('rejects a hand-crafted gcode payload below the X minimum', () => {
      const profile = createProfile();

      const result = profile.inspectPayload({
        print: { command: 'gcode_line', param: 'G90\nG1 X-10 F3000\n' },
      });

      expect(result.safe).toBe(false);
      expect(result.reason).toContain('X target -10');
    });

    it('closes the raw-passthrough bypass for out-of-range coordinates', () => {
      // Regression guard: POST /commands/raw hands payloads straight to
      // MqttTransportService.publish with no catalog validation. inspectPayload
      // is the only thing standing between that endpoint and an unsafe move.
      const profile = createProfile();
      const rawPassthroughPayload = {
        print: { command: 'gcode_line', param: 'G90\n G1 Z1000 F3000\n' },
      };

      expect(profile.inspectPayload(rawPassthroughPayload).safe).toBe(false);
    });

    it('ignores relative-mode (G91) moves, which carry no absolute target', () => {
      const profile = createProfile();

      expect(
        profile.inspectPayload({
          print: { command: 'gcode_line', param: 'M83\nG1 E50 F600\nM82\n' },
        }),
      ).toEqual({ safe: true });
    });

    it('only validates axes explicitly present in the gcode', () => {
      const profile = createProfile();

      expect(
        profile.inspectPayload({
          print: { command: 'gcode_line', param: 'G90\nG1 X125 F3000\n' },
        }),
      ).toEqual({ safe: true, targetPosition: { x: 125 } });
    });
  });
});
