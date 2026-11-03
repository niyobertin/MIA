const React = require('react');
const { View } = require('react-native');

const MockIcon = (props) => React.createElement(View, props);

module.exports = {
  Ionicons: MockIcon,
  AntDesign: MockIcon,
  MaterialIcons: MockIcon,
  FontAwesome: MockIcon,
  Feather: MockIcon,
  Entypo: MockIcon,
  MaterialCommunityIcons: MockIcon,
};
