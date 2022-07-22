import {
    PendantIconConfig,
    PendantOptions,
    PendantTypes,
    IconNames,
} from './types';
import {
    MultiSelectIcon,
    SingleSelectIcon,
    TextFontIcon,
    DateIcon,
    CollaboratorIcon,
    StatusIcon,
    PhoneIcon,
    InformationIcon,
    LocationIcon,
    EmailIcon,
} from '@toeverything/components/icons';

// export const selectColors = [
//     { background: '#C3DBFF', color: '#253486' },
//     { background: '#C6F1F3', color: '#0C6066' },
//     { background: '#C5FBE0', color: '#05683D' },
//     { background: '#FFF5AB', color: '#896406' },
//     { background: '#FFCCA7', color: '#8F4500' },
//     { background: '#FFCECE', color: '#AF1212' },
//     { background: '#E3DEFF', color: '#511AAB' },
// ];
//
// export const statusSelectColors = [
//     { background: '#C5FBE0', color: '#05683D' },
//     { background: '#FFF5AB', color: '#896406' },
//     { background: '#FFCECE', color: '#AF1212' },
//     { background: '#E3DEFF', color: '#511AAB' },
// ];

export const pendantColors = {
    [PendantTypes.Text]: {
        background: '#7389FD',
        color: '#FFF',
    },
    [PendantTypes.Date]: {
        background: '#5DC6CD',
        color: '#FFF',
    },
    [PendantTypes.Select]: {
        background: '#EAAE14',
        color: '#FFF',
    },
    [PendantTypes.MultiSelect]: {
        background: '#A691FC',
        color: '#FFF',
    },
    [PendantTypes.Mention]: {
        background: '#57C696',
        color: '#FFF',
    },
    [PendantTypes.Status]: {
        background: '#57C696',
        color: '#FFF',
    },
    [PendantTypes.Information]: {
        background: '#57C696',
        color: '#FFF',
    },
};

export const IconMap = {
    [IconNames.TEXT]: TextFontIcon,
    [IconNames.DATE]: DateIcon,
    [IconNames.STATUS]: StatusIcon,
    [IconNames.MULTI_SELECT]: MultiSelectIcon,
    [IconNames.SINGLE_SELECT]: SingleSelectIcon,
    [IconNames.COLLABORATOR]: CollaboratorIcon,
    [IconNames.INFORMATION]: InformationIcon,
    [IconNames.PHONE]: PhoneIcon,
    [IconNames.LOCATION]: LocationIcon,
    [IconNames.EMAIL]: EmailIcon,
};

export const pendantIconConfig: { [key: string]: PendantIconConfig } = {
    [PendantTypes.Text]: {
        name: IconNames.TEXT,
        background: '#67dcaa',
        color: '#FFF',
    },
    [PendantTypes.Date]: { name: IconNames.DATE, background: '', color: '' },
    [PendantTypes.Status]: {
        name: IconNames.STATUS,
        background: ['#C5FBE0', '#FFF5AB', '#FFCECE', '#E3DEFF'],
        color: ['#05683D', '#896406', '#AF1212', '#511AAB'],
    },
    [PendantTypes.Select]: {
        name: IconNames.SINGLE_SELECT,
        background: [
            '#C3DBFF',
            '#C6F1F3',
            '#C5FBE0',
            '#FFF5AB',
            '#FFCCA7',
            '#FFCECE',
            '#E3DEFF',
        ],
        color: [
            '#253486',
            '#0C6066',
            '#05683D',
            '#896406',
            '#8F4500',
            '#AF1212',
            '#511AAB',
        ],
    },

    [PendantTypes.MultiSelect]: {
        name: IconNames.MULTI_SELECT,
        background: [
            '#C3DBFF',
            '#C6F1F3',
            '#C5FBE0',
            '#FFF5AB',
            '#FFCCA7',
            '#FFCECE',
            '#E3DEFF',
        ],
        color: [
            '#253486',
            '#0C6066',
            '#05683D',
            '#896406',
            '#8F4500',
            '#AF1212',
            '#511AAB',
        ],
    },
    [PendantTypes.Mention]: {
        name: IconNames.COLLABORATOR,
        background: '#FFD568',
        color: '#FFFFFF',
    },
    [PendantTypes.Information]: {
        name: IconNames.INFORMATION,
        background: '#FFD568',
        color: '#FFFFFF',
    },
    Phone: {
        name: IconNames.PHONE,
        background: '#c3dbff',
        color: '#263486',
    },
    Location: {
        name: IconNames.LOCATION,
        background: '#c5f1f3',
        color: '#263486',
    },
    Email: {
        name: IconNames.EMAIL,
        background: '#ffcca7',
        color: '#8f4400',
    },
};

export const pendantOptions: PendantOptions[] = [
    {
        name: 'Text',
        type: PendantTypes.Text,
        iconName: IconNames.TEXT,
        subTitle: 'Add KeyWords',
    },
    {
        name: 'Date',
        type: PendantTypes.Date,
        iconName: IconNames.DATE,
        subTitle: '',
    },
    {
        name: 'Status',
        type: PendantTypes.Status,
        iconName: IconNames.STATUS,
        subTitle: '',
    },
    {
        name: 'Single Select',
        type: PendantTypes.Select,
        iconName: IconNames.SINGLE_SELECT,
        subTitle: 'Select A Options',
    },
    {
        name: 'Multiple Select',
        type: PendantTypes.MultiSelect,
        iconName: IconNames.MULTI_SELECT,
        subTitle: 'Create A List Of Options',
    },
    {
        name: 'Collaborator',
        type: PendantTypes.Mention,
        iconName: IconNames.COLLABORATOR,
        subTitle: 'Assign People',
    },
    {
        name: 'Information',
        type: PendantTypes.Information,
        iconName: IconNames.INFORMATION,
        subTitle: '',
    },
    // {
    //     name: 'Information',
    //     type: [PendantTypes.Phone, PendantTypes.Location, PendantTypes.Email],
    //     icon: InformationIcon,
    //     subTitle: '',
    // },
];
