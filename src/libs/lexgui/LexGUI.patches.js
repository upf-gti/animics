// temporal file to solve some functionalities of lexgui

import { LX } from 'lexgui';


class Tags extends LX.BaseComponent {
    constructor(name, value, callback, options = {}) {
      value = value.replace(/\s/g, "").split(",");
      let defaultValue = [].concat(value);
      super(LX.BaseComponent.TAGS, name, defaultValue, options);
      this.options.skipDuplicates = options.skipDuplicates ?? true;
      this.onGetValue = () => {
        return [].concat(value);
      };
      this.onSetValue = (newValue, skipCallback, event) => {
        value = [].concat(newValue);
        this.generateTags(value);
        if (!skipCallback) {
          this._trigger(new LX.IEvent(name, value, event), callback);
        }
      };
      this.onResize = (rect) => {
        var _a, _b;
        const realNameWidth = (_b = (_a = this.root.domName) == null ? void 0 : _a.style.width) != null ? _b : "0px";
        tagsContainer.style.width = `calc( 100% - ${realNameWidth})`;
      };
      const tagsContainer = document.createElement("div");
      tagsContainer.className = "lextags";
      this.root.appendChild(tagsContainer);
      this.generateTags = (value2) => {
        tagsContainer.innerHTML = "";
        for (let i = 0; i < value2.length; ++i) {
          const tagName = value2[i];
          const tag = document.createElement("span");
          tag.className = "lextag";
          tag.innerHTML = tagName;
          const removeButton = LX.makeIcon("X", {svgClass: "sm"});
          tag.appendChild(removeButton);
          removeButton.addEventListener("click", (e) => {
            tag.remove();
            value2.splice(value2.indexOf(tagName), 1);
            this.set(value2, false, e);
          });
          tagsContainer.appendChild(tag);
        }
        let tagInput = document.createElement("input");
        tagInput.value = "";
        tagInput.placeholder = "Add tag...";
        tagsContainer.appendChild(tagInput);
        tagInput.onkeydown = (e) => {
          if (e.key == " " || e.key == "Enter") {
            const val = tagInput.value.replace(/\s/g, "");
            e.preventDefault();
            if (!val.length || (options.skipDuplicates && value2.indexOf(val) > -1 ) )
              return;
            value2.push(val);
            this.set(value2, false, e);
            tagsContainer.querySelector("input").focus();
          }
        };
      };
      this.generateTags(value);
      LX.doAsync(this.onResize.bind(this));
    }
  }

  LX.Tags = Tags;
export{};