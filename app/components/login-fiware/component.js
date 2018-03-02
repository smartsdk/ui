import Ember from 'ember';

export default Ember.Component.extend({
  fiware: Ember.inject.service(),

  actions: {
    authenticate() {
      this.sendAction('action');
      Ember.run.later(() => {
        this.get('fiware').authorizeRedirect();
      }, 10);
    }
  }
});
