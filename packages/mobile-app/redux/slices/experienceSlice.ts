import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface ExperienceState {
  modalVisible: boolean;
}

const initialState: ExperienceState = {
  modalVisible: false,
};

const experienceSlice = createSlice({
  name: 'experience',
  initialState,
  reducers: {
    setModalVisible: (state, action: PayloadAction<boolean>) => {
      state.modalVisible = action.payload;
    },
  },
});

export const { setModalVisible } = experienceSlice.actions;
export default experienceSlice.reducer;
