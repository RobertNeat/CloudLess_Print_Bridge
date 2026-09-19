import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { I18nService } from './i18n.service';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [MessageService] });
    TestBed.inject(I18nService).language.set('en');
  });

  it('pushes a severity-tagged, translated message onto MessageService', () => {
    const messages = TestBed.inject(MessageService);
    const addSpy = vi.spyOn(messages, 'add');
    const notifications = TestBed.inject(NotificationService);

    notifications.info('videos.record.captureStarted');
    notifications.warn('videos.record.requiresOnlineCamera');
    notifications.error('videos.record.commandError');

    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'info', detail: 'Photo captured.' }),
    );
    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'warn', detail: 'Select an online camera to start recording.' }),
    );
    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error', detail: 'Could not send the command to the camera.' }),
    );
  });
});
