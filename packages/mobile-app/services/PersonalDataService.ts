import { store } from '../redux/store';
import { setPersonalData, selectPersonalData } from '../redux/slices/personalSlice';
import Toast from 'react-native-toast-message';

class PersonalDataService {
  private static instance: PersonalDataService;

  private constructor() {
    console.log('[PersonalDataService] Service initialized');
  }

  public static getInstance(): PersonalDataService {
    if (!PersonalDataService.instance) {
      console.log('[PersonalDataService] Creating new instance');
      PersonalDataService.instance = new PersonalDataService();
    }
    return PersonalDataService.instance;
  }

  private getCurrentData(): string {
    const data = selectPersonalData(store.getState());
    console.log('[PersonalDataService] Current data retrieved:', data);
    return typeof data == "string" ? data : JSON.stringify(data);
  }

  private isEqual(obj1: any, obj2: any): boolean {
    return JSON.stringify(obj1) === JSON.stringify(obj2);
  }

  public handleUpdateData(newData: Record<string, any> | null | string) {
    try {
      console.log('[PersonalDataService] Handling update data:', newData);
      
      // If newData is null, no changes were detected by the API
      if (newData == "" ||
        newData === null ||
        newData === "null" ||
        (typeof(newData) === "object" && Object.keys(newData).length === 0) ||
        (typeof newData === 'string' && !/[a-zA-Z]/.test(newData))
      ){
        console.log('[PersonalDataService] No changes detected');
        return;
      }

      const currentData = this.getCurrentData();

      // Only dispatch and show toast if data actually changed
      if (!this.isEqual(currentData, newData)) {
        console.log('[PersonalDataService] Changes detected, dispatching updated data:', newData);
        store.dispatch(setPersonalData(newData));
        Toast.show({
          type: 'success',
          text1: 'Memory updated',
          position: 'top',
          visibilityTime: 3000,
        });
      } else {
        console.log('[PersonalDataService] No changes detected');
      }
    } catch (error) {
      console.error('[PersonalDataService] Error updating data:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to update data. Please try again.',
        position: 'bottom',
        visibilityTime: 3000,
      });
    }
  }

  public processMessage(message: any) {
    console.log('[PersonalDataService] Processing message:', message);
    if (message.updateData) {
      this.handleUpdateData(message.updateData);
    }
  }
}

export default PersonalDataService;
