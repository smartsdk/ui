import Ember from 'ember';

export default Ember.Component.extend({
  allServices : Ember.inject.service(),

  selected:          null,  // Selected service ID
  custom:            null, // Custom input
  selectClass:       'form-control',
  canBalanceTo:      false, // require service have canBalanceTo=true
  canHaveContainers: false, // require service have hasContainers=true
  exclude:           null,  // ID or array of IDs to exclude from list
  showCustomOption:  null, // Show a custom option where user can input text
  customMode:        null, // Custom mode

  // For use as a catalog question
  field: null,              // Read default from a schema resourceField
  value: null,              // stackName/serviceName string output

  init() {
    this._super(...arguments);

    let def = this.get('value') ? this.get('value') : this.get('field.default');
    if ( def && !this.get('selected') ) {
      var exact, justService;

      this.get('allServices.list').forEach((service) => {
        if (def === `${service.stackName}/${service.name}`)
        {
          exact = service.id;
        }
        else if ( def === service.name )
        {
          justService = service.id;
        }
      });

      this.set('selected', exact || justService || null);
    }
  },

  grouped: function() {
    let list = this.get('allServices.list');

    if ( this.get('canBalanceTo') ) {
      list = list.filterBy('obj.canBalanceTo',true);
    }

    if ( this.get('canHaveContainers') ) {
      list = list.filterBy('obj.canHaveContainers',true);
    }

    let exclude = this.get('exclude');
    if ( exclude ) {
      if ( !Ember.isArray(exclude) ) {
        exclude = [exclude];
      }

      list = list.filter(x => !exclude.includes(x.id));
    }

    return this.get('allServices').group(list);
  }.property('allServices.list.[]','canBalanceTo','canHaveContainers'),

  selectedChanged: function() {
    let id = this.get('selected');
    let str = null;

    if (this.get('showCustomOption') && id !== null ) {
      this.set('custom', null);
      if (id === 'customMode') {
        setTimeout(() => {
          this.$('.input-select')[0].focus();
        }, 100);
        this.set('customMode', true);
        this.set('selected', null);
      } else {
        this.set('customMode', false);
      }
    }

    if ( id ) {
      let service = this.get('allServices').byId(id);
      if ( service ) {
        str = service.get('stack.name') + '/' + service.get('name');
      }
    }

    this.set('value', str);
  }.observes('selected'),
});
