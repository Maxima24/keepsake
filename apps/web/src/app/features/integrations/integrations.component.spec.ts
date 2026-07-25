import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { IntegrationsComponent } from './integrations.component';
import { ReconciliationApi } from '../../core/api/reconciliation.api';

function create() {
  const api = {
    listSources: () => of([]),
    listApiKeys: () => of([]),
    listNeedsMapping: () => of([]),
    setMapping: jasmine.createSpy('setMapping').and.returnValue(of({})),
    uploadFile: jasmine.createSpy('uploadFile').and.returnValue(of({})),
    createSource: jasmine.createSpy('createSource').and.returnValue(of({})),
    mintKey: jasmine.createSpy('mintKey').and.returnValue(of({})),
    revokeKey: jasmine.createSpy('revokeKey').and.returnValue(of({})),
  };
  TestBed.configureTestingModule({
    imports: [IntegrationsComponent],
    providers: [{ provide: ReconciliationApi, useValue: api }],
  });
  const component = TestBed.createComponent(IntegrationsComponent).componentInstance;
  return { component, api };
}

describe('IntegrationsComponent', () => {
  describe('saveMapping', () => {
    it('rejects invalid JSON without calling the API', () => {
      const { component, api } = create();
      component.mappingSourceId.set('s1');
      component.mappingJson.set('{ not valid json');
      component.saveMapping();
      expect(component.error()).toContain('valid JSON');
      expect(api.setMapping).not.toHaveBeenCalled();
    });

    it('requires a source to be selected', () => {
      const { component, api } = create();
      component.mappingSourceId.set('');
      component.saveMapping();
      expect(component.error()).toContain('Pick a source');
      expect(api.setMapping).not.toHaveBeenCalled();
    });

    it('calls the API with parsed JSON when valid', () => {
      const { component, api } = create();
      component.mappingSourceId.set('s1');
      component.mappingJson.set('{ "hasHeader": true }');
      component.saveMapping();
      expect(api.setMapping).toHaveBeenCalledWith('s1', { hasHeader: true });
    });
  });

  describe('upload', () => {
    it('requires both a source and a file', () => {
      const { component, api } = create();
      component.uploadSource.set('');
      component.uploadFile.set(null);
      component.upload();
      expect(component.error()).toBeTruthy();
      expect(api.uploadFile).not.toHaveBeenCalled();
    });
  });
});
