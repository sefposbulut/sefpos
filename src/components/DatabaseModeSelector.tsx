import { ElectronConnectionMenu, type ElectronConnectMode } from './electron/ElectronConnectionMenu';

interface Props {
  onSelect: (mode: ElectronConnectMode) => void;
}

/** @deprecated ElectronConnectionMenu kullanın */
export function DatabaseModeSelector({ onSelect }: Props) {
  return <ElectronConnectionMenu onSelect={onSelect} variant="switch" />;
}
