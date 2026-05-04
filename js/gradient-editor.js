export class GradientEditor {
  constructor(container, onChange) {
    this.container = container;
    this.onChange = onChange;
    this.stops = [];
    this.build();
  }

  build() {
    this.container.innerHTML = '';

    const preview = document.createElement('div');
    preview.className = 'gradient-preview';
    this.previewEl = preview;
    this.container.appendChild(preview);

    this.stopsList = document.createElement('div');
    this.stopsList.className = 'gradient-stops-list';
    this.container.appendChild(this.stopsList);

    const addBtn = document.createElement('button');
    addBtn.className = 'dg-add-stop';
    addBtn.textContent = '+ add stop';
    addBtn.addEventListener('click', () => this.addStop());
    const wrap = document.createElement('div');
    wrap.style.textAlign = 'center';
    wrap.style.padding = '4px 0 0 0';
    wrap.appendChild(addBtn);
    this.container.appendChild(wrap);
  }

  setStops(stops) {
    if (this.stops.length === stops.length) {
      this.stops = stops.map((s) => ({ ...s }));
      this.updateExistingInputs();
      this.updatePreview();
      return;
    }
    this.stops = stops.map((s) => ({ ...s }));
    this.renderStops();
    this.updatePreview();
  }

  updateExistingInputs() {
    const rows = this.stopsList.querySelectorAll('.gradient-stop-row');
    rows.forEach((row, i) => {
      const stop = this.stops[i];
      if (!stop) return;
      const colorInput = row.querySelector('input[type="color"]');
      const posInput = row.querySelector('.gradient-pos-slider');
      const posLabel = row.querySelector('.gradient-pos-label');
      if (colorInput && document.activeElement !== colorInput) {
        colorInput.value = stop.color;
      }
      if (posInput && document.activeElement !== posInput) {
        const pct = Math.round(stop.position * 100);
        posInput.value = pct;
        if (posLabel) posLabel.textContent = pct + '%';
      }
    });
  }

  getStops() {
    return this.stops.map((s) => ({ ...s }));
  }

  renderStops() {
    this.stopsList.innerHTML = '';
    this.stops.forEach((stop, i) => {
      const row = document.createElement('div');
      row.className = 'gradient-stop-row';

      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = stop.color;
      colorInput.className = 'dg-color';
      colorInput.addEventListener('input', (e) => {
        this.stops[i].color = e.target.value;
        this.updatePreview();
        this.onChange(this.getStops());
      });

      const posInput = document.createElement('input');
      posInput.type = 'range';
      posInput.min = '0';
      posInput.max = '100';
      posInput.step = '1';
      posInput.value = Math.round(stop.position * 100);
      posInput.className = 'gradient-pos-slider';

      const posLabel = document.createElement('span');
      posLabel.className = 'gradient-pos-label';
      posLabel.textContent = Math.round(stop.position * 100) + '%';

      posInput.addEventListener('input', (e) => {
        this.stops[i].position = parseInt(e.target.value) / 100;
        posLabel.textContent = e.target.value + '%';
        this.updatePreview();
        this.onChange(this.getStops());
      });

      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn-remove';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => this.removeStop(i));
      if (this.stops.length <= 2) removeBtn.disabled = true;

      row.appendChild(colorInput);
      row.appendChild(posInput);
      row.appendChild(posLabel);
      row.appendChild(removeBtn);
      this.stopsList.appendChild(row);
    });
  }

  updatePreview() {
    const sorted = [...this.stops].sort((a, b) => a.position - b.position);
    const gradStr = sorted.map((s) => `${s.color} ${s.position * 100}%`).join(', ');
    this.previewEl.style.background = `linear-gradient(to right, ${gradStr})`;
  }

  addStop() {
    this.stops.push({ color: '#ffffff', position: 0.5 });
    this.sortStops();
    this.renderStops();
    this.updatePreview();
    this.onChange(this.getStops());
  }

  removeStop(index) {
    if (this.stops.length <= 2) return;
    this.stops.splice(index, 1);
    this.renderStops();
    this.updatePreview();
    this.onChange(this.getStops());
  }

  sortStops() {
    this.stops.sort((a, b) => a.position - b.position);
  }
}
