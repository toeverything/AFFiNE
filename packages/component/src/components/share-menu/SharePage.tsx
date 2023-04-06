import { Button } from '../..';
import { Switch } from '../../ui/switch/Switch';
const SharePage = () => {
  const handleSwitchChange = (checked: boolean) => {
    console.log('Switch state:', checked);
  };
  return (
    <div>
      <div>Sharing page publicly requires AFFiNE Cloud service.</div>
      <div>
        <Button type="light" shape="circle">
          Enable AFFiNE Cloud
        </Button>
      </div>
      <Switch onChange={handleSwitchChange}>ggsimida</Switch>
    </div>
  );
};

export default SharePage;
